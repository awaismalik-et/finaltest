const fs = require('fs');
const path = require('path');

const client = process.argv[2];
const service = process.argv[3];

try {
    const configPath = path.join(process.cwd(), 'bankos-dr', 'configuration', client, service, 'configuration.json');
    if (fs.existsSync(configPath)) {
        const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

        let key;
        if (service === 's3') key = 'triggers';
        else if (service === 's3-sync') key = 'buckets';
        else if (service === 'transfer-family') key = 'servers';
        else if (service === 'vpn_endpoint') key = 'vpn_endpoints';
        else if (service === 'cloudfront') key = 'cloudfront';
        else if (service === 'route53') key = 'routes'; 
        else key = service;

        const resources = config[key];
        
        if (resources && Array.isArray(resources)) {
            console.log(resources.length);
        } else {
            console.log(0);
        }
    } else {
        console.log(0);
    }
} catch (error) {
    console.error(`Error processing config for client '${client}', service '${service}':`, error);
    console.log(0);
}
