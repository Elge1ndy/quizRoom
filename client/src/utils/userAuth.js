export const getPersistentUserId = () => {
    // Unified: use device_id as the single identifier
    return getPersistentDeviceId();
};

export const getPersistentDeviceId = () => {
    let id = localStorage.getItem('quiz_device_id');
    if (!id) {
        try {
            if (typeof crypto !== 'undefined' && crypto.randomUUID) {
                id = crypto.randomUUID();
            } else {
                id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
            }
        } catch (e) {
            id = `dev_${Date.now()}_${Math.random().toString(36).substring(2, 11)}`;
        }
        localStorage.setItem('quiz_device_id', id);
    }
    return id;
};

/**
 * Registers or updates a player in the database, handling nickname conflicts.
 * 
 * @param {object} supabase - Supabase client instance
 * @param {object} playerProfile - { deviceId, nickname, avatar, last_seen }
 * @param {object} options - { autoHandleConflict: boolean, maxRetries: number }
 * @returns {Promise<{ data: object, error: object, isRenamed: boolean, newNickname: string }>}
 */
export const registerOrUpdatePlayer = async (supabase, playerProfile, options = {}) => {
    const { autoHandleConflict = false, maxRetries = 3 } = options;
    let currentNickname = playerProfile.nickname;
    let attempts = 0;
    let isRenamed = false;

    while (attempts <= maxRetries) {
        attempts++;
        
        // Try upsert first (insert or update on device_id conflict)
        const { data, error } = await supabase
            .from('players')
            .upsert({
                device_id: playerProfile.device_id,
                nickname: currentNickname,
                avatar: playerProfile.avatar,
                last_seen: new Date().toISOString()
            }, { onConflict: 'device_id', ignoreDuplicates: false })
            .select()
            .maybeSingle();

        if (!error) {
            return { data, error: null, isRenamed, newNickname: currentNickname };
        }

        // Unique constraint violation (nickname taken)
        if (error.code === '23505' || error.status === 409) {
            if (autoHandleConflict && attempts <= maxRetries) {
                const suffix = Math.floor(1000 + Math.random() * 9000);
                const baseName = currentNickname.split('#')[0];
                currentNickname = `${baseName}#${suffix}`;
                isRenamed = true;
                continue;
            }
            // If not auto-handling, try update instead of insert
            const { data: existingPlayer } = await supabase
                .from('players')
                .select('*')
                .eq('device_id', playerProfile.device_id)
                .maybeSingle();
            
            if (existingPlayer) {
                return { data: existingPlayer, error: null, isRenamed: false, newNickname: existingPlayer.nickname };
            }
            
            return { data: null, error: { ...error, customMsg: 'الاسم مستخدم بالفعل' }, isRenamed: false };
        }

        // Other errors
        return { data: null, error, isRenamed: false };
    }
    
    return { data: null, error: { message: 'Max retries exceeded' }, isRenamed: false };
};
