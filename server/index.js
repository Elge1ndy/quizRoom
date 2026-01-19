const express = require('express');
const path = require('path');
const app = express();

const PORT = process.env.PORT || 3005;

// Serve static files from the React client build directory
const clientBuildPath = path.join(__dirname, '../client/dist');
app.use(express.static(clientBuildPath));

// Handle SPA routing: return index.html for any unknown route
app.get('*', (req, res) => {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running and hosting client on port ${PORT}`);
});
