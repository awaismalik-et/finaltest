const fs = require('fs');
const path = require('path');

const client = process.argv[2];
const service = process.argv[3];

try {
    const configPath = path.join(process.cwd(), 'bankos-dr', 'configuration', client, service, 'configuration.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        if (config.rds && Array.isArray(config.rds)) {
            console.log(config.rds.length);
        } else {
            console.log(0);
        }
    } else {
        console.log(0);
    }
} catch (error) {
    console.error(`Error processing config for ${client}:`, error);
    console.log(0);
}
