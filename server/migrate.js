// Migration script: JSON -> Supabase
// Run this ONCE to migrate existing player data

const fs = require('fs');
const path = require('path');
const { registerPlayer } = require('./database');

const DEVICE_REGISTRY_PATH = path.join(__dirname, 'data', 'device_registry.json');
const BACKUP_PATH = path.join(__dirname, 'data', 'device_registry.backup.json');

async function migrateData() {
    console.log('🔄 Starting migration from JSON to Supabase...\n');

    // Check if JSON file exists
    if (!fs.existsSync(DEVICE_REGISTRY_PATH)) {
        console.log('❌ No device_registry.json found. Nothing to migrate.');
        return;
    }

    // Read JSON data
    const jsonData = fs.readFileSync(DEVICE_REGISTRY_PATH, 'utf8');
    const deviceRegistry = JSON.parse(jsonData);
    const entries = Object.entries(deviceRegistry);

    console.log(`📊 Found ${entries.length} players to migrate\n`);

    if (entries.length === 0) {
        console.log('✅ No players to migrate.');
        return;
    }

    let successCount = 0;
    let errorCount = 0;
    const errors = [];

    // Migrate each player
    for (const [deviceId, playerData] of entries) {
        const { nickname, avatar } = playerData;

        console.log(`Migrating: ${nickname} (${deviceId})...`);

        const result = await registerPlayer(deviceId, nickname, avatar);

        if (result.success) {
            successCount++;
            console.log(`  ✅ Success`);
        } else {
            errorCount++;
            console.log(`  ❌ Failed: ${result.error}`);
            errors.push({ deviceId, nickname, error: result.error });
        }
    }

    console.log('\n' + '='.repeat(50));
    console.log(`📊 Migration Summary:`);
    console.log(`   ✅ Successful: ${successCount}`);
    console.log(`   ❌ Failed: ${errorCount}`);
    console.log('='.repeat(50) + '\n');

    if (errors.length > 0) {
        console.log('❌ Errors:');
        errors.forEach(err => {
            console.log(`   - ${err.nickname}: ${err.error}`);
        });
        console.log('');
    }

    // Create backup
    if (successCount > 0) {
        console.log('💾 Creating backup of JSON file...');
        fs.copyFileSync(DEVICE_REGISTRY_PATH, BACKUP_PATH);
        console.log(`✅ Backup created: ${BACKUP_PATH}\n`);

        console.log('🗑️  You can now safely delete device_registry.json');
        console.log('   Or keep it as a backup.\n');
    }

    console.log('✅ Migration complete!');
}

// Run migration
migrateData()
    .then(() => {
        console.log('\n🎉 All done!');
        process.exit(0);
    })
    .catch(err => {
        console.error('\n❌ Migration failed:', err);
        process.exit(1);
    });
