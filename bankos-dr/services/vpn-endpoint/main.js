const { custom_logging }  = require ('../../helper/helper.js')
const fs = require('fs');
const path = require('path');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const { awsEnvironment }  = require ('../../helper/enum.js')
const readFileAsync = promisify(fs.readFile);
async function readAndParseFile(file) {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    const dataToJson = JSON.parse(data);
    return dataToJson
  }
const {  modifyVpnConnectionRoute } = require('../../helper/aws/ec2.js')

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
maxRetries: 5, // Maximum number of retries
    retryDelayOptions: { 
        base: 200 // Base delay in milliseconds
    }
})
const processVpnEndpoint = async (environmentConfig) => {
    custom_logging(chalk.green("Starting process on Endpoints"))
    for (let vpn_endpoint of environmentConfig.vpn_endpoints) {
        let ec2toAddIpsClient, ec2toRemoveIpsClient, endpointToAddIpsTo, endPointToRemoveIpsFrom;
    
        if (environmentConfig.switching_to === awsEnvironment.ACTIVE_ENV) {
            ec2toAddIpsClient = new AWS.EC2 ({region: environmentConfig.active_region});
            ec2toRemoveIpsClient = new AWS.EC2 ({region: environmentConfig.failover_region});
            endpointToAddIpsTo = vpn_endpoint.active_vpn_endpoint_id;
            endPointToRemoveIpsFrom = vpn_endpoint.failover_vpn_endpoint_id;
        }
        else {
            ec2toAddIpsClient = new AWS.EC2 ({region: environmentConfig.failover_region})
            ec2toRemoveIpsClient = new AWS.EC2 ({region: environmentConfig.active_region})
            endpointToAddIpsTo = vpn_endpoint.failover_vpn_endpoint_id
            endPointToRemoveIpsFrom = vpn_endpoint.active_vpn_endpoint_id;
        }
        
        try {
            await modifyVpnConnectionRoute(ec2toAddIpsClient, endpointToAddIpsTo, vpn_endpoint.ip_list, true)
        }
        catch (error) {
            custom_logging(chalk.red("Error: ") + error.message);
        }

        if (global.PROCESS_CURRENT_ENVIRONMENT) {
            try {
                await modifyVpnConnectionRoute(ec2toRemoveIpsClient, endPointToRemoveIpsFrom, vpn_endpoint.ip_list, false)
            }
            catch (error) {
                custom_logging(chalk.red("Error: ") + error.message);
            }
        }
    }
}

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('-pce --processCurrentEnvironment', "Whether to perform the process on current environment")

    .parse(process.argv);
    
    const options = program.opts();
    const file = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'vpn_endpoint', 'configuration.json');
    let envs = await readAndParseFile(file)
    envs['switching_to'] = process.env.SWITCHING_TO
    envs['CLIENT_NAME'] = process.env.CLIENT_NAME
    console.log(envs)
    if (options.dryRun) {
        global.DRY_RUN = true;
        custom_logging(chalk.yellow("DRY RUN is enabled"))
    }
    else
        custom_logging(chalk.red("DRY RUN is disabled"))

    if (options.processCurrentEnvironment) {
        global.PROCESS_CURRENT_ENVIRONMENT = true;
        custom_logging(chalk.red("Current environment will be processed"))
    }
    else
        custom_logging(chalk.yellow("Current environment will not be processed"))

    custom_logging(`Switing to ${chalk.green(envs.switching_to)} environment`)
    await processVpnEndpoint(envs)
    custom_logging(chalk.green("Process has been completed"));
};

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });
