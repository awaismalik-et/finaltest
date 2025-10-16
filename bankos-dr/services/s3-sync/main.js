const AWS = require('aws-sdk');
const fs = require('fs');
const os = require('os');
const { promisify } = require('util');
const { spawn } = require('child_process');
const path = require('path');
const { program } = require('commander');
const chalk = require('chalk');
const { custom_logging } = require('../../helper/helper.js');
const { 
  getObjectsCount,
  syncS3Buckets
} = require('../../helper/aws/s3.js');

const readFileAsync = promisify(fs.readFile);
global.DRY_RUN = false;

AWS.config.update({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  sessionToken: process.env.AWS_SESSION_TOKEN,
  maxRetries: 5,
  retryDelayOptions: { base: 200 },
});

const readAndParseFile = async (file) => {
  const data = await readFileAsync(file, { encoding: 'utf-8' });
  return JSON.parse(data);
};

const syncS3BucketContents = async (s3Settings) => {
  custom_logging(chalk.green("Starting S3 Bucket Content Synchronization Process"));

  const sourceRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.failover_region : s3Settings.active_region;
  const targetRegion = s3Settings.switching_to === "ACTIVE" ? s3Settings.active_region : s3Settings.failover_region;

  for (const bucket of s3Settings.buckets) {
    const sourceBucket = s3Settings.switching_to === "ACTIVE" ? bucket.failover_bucket : bucket.active_bucket;
    const targetBucket = s3Settings.switching_to === "ACTIVE" ? bucket.active_bucket : bucket.failover_bucket;
    
    const sourceS3 = new AWS.S3({ region: sourceRegion });
    const targetS3 = new AWS.S3({ region: targetRegion });

    try {
      const sourceObjectCount = await getObjectsCount(sourceS3, sourceBucket);
      const targetObjectCount = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Syncing contents from ${sourceBucket} in ${sourceRegion} to ${targetBucket} in ${targetRegion}`));
      custom_logging(chalk.blue(`Source bucket has ${sourceObjectCount} objects. Target bucket has ${targetObjectCount} objects before sync.`));
      
      const syncOptions = {
        prefix: '', 
        deleteExtraFiles: false
      };

      const syncResults = await syncS3Buckets(
        sourceRegion,
        targetRegion,
        sourceBucket, 
        targetBucket, 
        syncOptions
      );

      const targetObjectCountAfter = await getObjectsCount(targetS3, targetBucket);
      
      custom_logging(chalk.green(`Sync completed for ${sourceBucket} → ${targetBucket}`));
      custom_logging(chalk.blue(`Target bucket now has ${targetObjectCountAfter} objects (was ${targetObjectCount} before sync)`));
      
    } catch (error) {
      custom_logging(chalk.red(`Error syncing buckets ${sourceBucket} to ${targetBucket}: ${error.message}`));
      throw error;
    }
  }
};

const mainFunction = async () => {
  program
    .version('1.0.0')
    .option('-dr, --dryRun', "Dry run the process")
    .option('--s3sync-index <index>', 'Process only this S3sync bucket index')
    .parse(process.argv);

  global.SLEEP_TIME = 1000;

  const options = program.opts();
  global.DRY_RUN = options.dryRun || false;
  
  if (global.DRY_RUN) {
    custom_logging(chalk.yellow("Running in DRY RUN mode - no changes will be made"));
  }
  
  const configFile = path.resolve(__dirname, '..', '..', 'configuration', process.env.CLIENT_NAME, 's3-sync', 'configuration.json');
  
  try {
    let config = await readAndParseFile(configFile);
    config['switching_to'] = process.env.SWITCHING_TO;
    
    custom_logging(`Switching to ${chalk.green(config.switching_to)} environment`);

    if (options.s3syncIndex !== undefined) {
      custom_logging(chalk.green(`Processing s3-sync resource at index: ${options.s3syncIndex}`));
      const idx = parseInt(options.s3syncIndex);
      if (idx >= 0 && idx < config.buckets.length) {
        config.buckets = [ config.buckets[idx] ]
      } else {
        custom_logging(chalk.red(`Index ${idx} out of bounds (0..${config.buckets.length - 1})`));
        return;
      }
    } else {
      custom_logging(chalk.yellow("Processing all s3-sync resources"));
    }

    //try {
    //  const checkAwsCli = spawn('which', ['aws']);
    //  let found = false;
    //  
    //  checkAwsCli.stdout.on('data', (data) => {
    //    custom_logging(chalk.green(`AWS CLI found at: ${data.toString().trim()}`));
    //    found = true;
    //  });
    //  
    //  await new Promise((resolve) => {
    //    checkAwsCli.on('close', (code) => {
    //      if (code !== 0 || !found) {
    //        custom_logging(chalk.red("AWS CLI not found! Please install AWS CLI before running this script."));
    //        process.exit(1);
    //      }
    //      resolve();
    //    });
    //  });
    //  
    //  const versionProcess = spawn('aws', ['--version']);
    //  versionProcess.stdout.on('data', (data) => {
    //    custom_logging(chalk.green(`Using AWS CLI: ${data.toString().trim()}`));
    //  });
    //  
    //  await new Promise((resolve) => {
    //    versionProcess.on('close', resolve);
    //  });
    //} catch (error) {
    //  custom_logging(chalk.red(`Error checking AWS CLI: ${error.message}`));
    //  process.exit(1);
    //}

    //await syncS3BucketContents(config);
    custom_logging(chalk.green("Process completed successfully"));
  } catch (error) {
    custom_logging(chalk.red(`Error in main function: ${error.message}`));
    process.exit(1);
  }
};

mainFunction().catch(error => {
  custom_logging(chalk.red("Uncaught Error: ") + error.message);
  process.exit(1);
});