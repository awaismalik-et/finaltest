const { custom_logging , find_in_array_by_key_and_val }  = require ('../../helper/helper.js')
const fs = require('fs');
const { program } = require('commander');
const { promisify } = require('util');
const chalk = require('chalk');
const path = require('path');
const { awsEnvironment}  = require ('../../helper/enum.js')
const readFileAsync = promisify(fs.readFile);
async function readAndParseFile(file) {
    const data = await readFileAsync(file, { encoding: 'utf-8' });
    const dataToJson = JSON.parse(data);
    return dataToJson
  }

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

const {  updateDistribution, createInvalidation } = require('../../helper/aws/cloudfront.js')
const processCloudFront = async (cloudfrontSettings) => {
    custom_logging(chalk.green("Starting process on Cloudfront"))
    let cloudfront = new AWS.CloudFront();
    console.log(cloudfrontSettings)
    let cloudfrontIds = cloudfrontSettings.cloudfront

    try 
    {
        for (let distribution of cloudfrontIds) {
            let data = await cloudfront.getDistributionConfig({ Id: distribution.id }).promise();
            let distributionConfig = data.DistributionConfig;
        
            let cloudfrontConfig = cloudfrontSettings.cloudfront.find(c => c.id === distribution.id);
            if (!cloudfrontConfig) {
                console.log( new Error(`CloudFront distribution with ID '${distribution.id}' not found in the JSON.`))
                continue
            }
        
            let behaviors = cloudfrontConfig.behaviors; // Ensure behaviors is correctly assigned
            if (!behaviors || behaviors.length === 0) {
                custom_logging(`⚠️ Warning: No behaviors found for distribution ID ${distribution.id}`);
                continue; // Skip this distribution
            }
        
            custom_logging(`Processing cloudfront ID ${chalk.red(distribution.id)}`);
        
            let defaultBehavior = distributionConfig.DefaultCacheBehavior;
            let cacheBehaviors = distributionConfig.CacheBehaviors.Items;
        
            for (let behavior of cacheBehaviors) {
                find_and_update_cloudfront_origin(behavior, behaviors, "path", behavior.PathPattern, cloudfrontSettings.switching_to);
            }
        
            find_and_update_cloudfront_origin(defaultBehavior, behaviors, "path", "Default", cloudfrontSettings.switching_to);
        
            await updateDistribution(cloudfront, distribution.id, distributionConfig, data.ETag);
            await createInvalidation(cloudfront, distribution.id);
        }
    } catch (error) {
        custom_logging(chalk.red("Error: ") + error.message);
    }
}
const find_and_update_cloudfront_origin = function(behaviour, arr, key, val, switching_to_env) {
    if (!arr || arr.length === 0) {
        custom_logging(`⚠️ Warning: Behaviors array is empty or undefined when looking for '${val}'`);
        return null;
    }

    console.log(`Looking for '${val}' in key '${key}' inside:`, arr);

    let matched_origin = find_in_array_by_key_and_val(arr, key, val);
    console.log('Matched Origin:', matched_origin);

    let origin = null;
    if (matched_origin) {
        origin = (switching_to_env === awsEnvironment.ACTIVE_ENV) 
            ? matched_origin.active_origin 
            : matched_origin.failover_origin;

        if (behaviour.TargetOriginId === origin) {
            custom_logging(`Origin already set for path '${val}'`);
        } else {
            custom_logging(`Updating origin '${behaviour.TargetOriginId}' to '${origin}' for path '${val}'`);
            behaviour.TargetOriginId = origin;
        }
    } else {
        custom_logging(`Configuration not found for path '${val}'`);
    }
    
    return origin;
};

const processFiles = async(file, options) => {
    if (!fs.existsSync(file)) {
        custom_logging(chalk.red(`Configuration file not found: ${file}, skipping...`));
        return;
    }

    let file_config = await readAndParseFile(file);
    file_config['switching_to'] = process.env.SWITCHING_TO;
    file_config['CLIENT_NAME'] = process.env.CLIENT_NAME;

    //this block checks the index and sets the cloudfront array in the file_config to point to that index
    if (options.cloudfrontIndex !== undefined) {
        const idx = parseInt(options.cloudfrontIndex);
        if (idx < 0 || idx >= file_config.cloudfront.length) {
            custom_logging(chalk.red(`Index ${idx} out of bounds (0..${file_config.cloudfront.length - 1})`));
            return;
        }
        //after this the file_config only contains the required index cloudfront resource.
        file_config.cloudfront = [ file_config.cloudfront[idx] ];
    }

    custom_logging(`Switching to ${chalk.green(file_config.switching_to)} environment`);
    //await processCloudFront(file_config);
}

const mainFunction = async () => {
    program
    .version('0.0.1')
    .option('-dr --dryRun', "Dry run the process")
    .option('--cloudfront-index <index>', 'Index of cloudfront resource to process')
    .parse(process.argv);

    global.SLEEP_TIME = 1000;
    
    const options = program.opts();
    
    if (options.dryRun) {
        global.DRY_RUN = true;
        custom_logging(chalk.yellow("DRY RUN is enabled"));
    } else {
        custom_logging(chalk.red("DRY RUN is disabled"));
    }

    if (options.cloudfrontIndex !== undefined) {
        custom_logging(chalk.green(`Processing cloudFront resource at index: ${options.cloudfrontIndex}`));
    } else {
        custom_logging(chalk.yellow("Processing all cloudfront resources"));
    }

    let clientFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 'cloudfront', 'configuration.json');
    await processFiles(clientFile, options);
    
    custom_logging(chalk.green("Process has been completed"));
}    

mainFunction()
    .then(() => {
        custom_logging(chalk.green("Exiting ..."));
    })
    .catch((error) => {
        custom_logging(chalk.red("Error: ") + error.message);
    });
