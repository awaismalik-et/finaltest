const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const { custom_logging } = require('../helper.js');
const chalk = require('chalk');

const getBucketNotificationConfiguration = async(bucketClient, bucketName) => {
    await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
    return await bucketClient.getBucketNotificationConfiguration({
        Bucket: bucketName
    }).promise();
}

const putBucketNotificationConfiguration = async(bucketClient, bucketName, configuration) => {
  if (!global.DRY_RUN) {
      await new Promise(resolve => setTimeout(resolve, global.SLEEP_TIME));
      await bucketClient.putBucketNotificationConfiguration({
          Bucket: bucketName,
          NotificationConfiguration: configuration,
          SkipDestinationValidation: true
      }).promise();
  }
}
  
const deleteBucketNotificationConfiguration = async (s3Client, bucket) => {
  if (!global.DRY_RUN) {
    await s3Client.putBucketNotificationConfiguration({
      Bucket: bucket,
      NotificationConfiguration: {}
    }).promise();
  }
};

const getObjectsCount = async (s3Client, bucketName) => {
  try {
    const result = await s3Client.listObjectsV2({ Bucket: bucketName }).promise();
    return result.KeyCount || 0;
  } catch (error) {
    custom_logging(chalk.red(`Error counting objects in ${bucketName}: ${error.message}`));
    return 0;
  }
};

const syncS3Buckets = async (sourceRegion, targetRegion, sourceBucket, targetBucket, options = {}) => {
  const {
    prefix = '',
    deleteExtraFiles = false,
  } = options;

  return new Promise((resolve, reject) => {
    if (global.DRY_RUN) {
      custom_logging(`[DRY RUN] Would sync from s3://${sourceBucket}/${prefix} to s3://${targetBucket}/${prefix}`);
      return resolve({
        success: true,
        transferred: 0,
        skipped: 0,
        dryRun: true
      });
    }

    // Create a temporary config file for S3 transfer settings
    const tempConfigDir = fs.mkdtempSync(path.join(os.tmpdir(), 'aws-config-'));
    const tempConfigFile = path.join(tempConfigDir, 'config');
    
    const DEFAULT_MAX_CONCURRENCY = 20;
    const DEFAULT_MULTIPART_THRESHOLD = '8MB';
    const DEFAULT_MULTIPART_CHUNKSIZE = '16MB';
    const DEFAULT_MAX_QUEUE = 10000;
    
    const configContent = `
[profile s3transfer]
region = ${targetRegion}
aws_access_key_id = ${process.env.AWS_ACCESS_KEY_ID}
aws_secret_access_key = ${process.env.AWS_SECRET_ACCESS_KEY}
aws_session_token = ${process.env.AWS_SESSION_TOKEN}
s3 =
  max_concurrent_requests = ${DEFAULT_MAX_CONCURRENCY}
  multipart_threshold = ${DEFAULT_MULTIPART_THRESHOLD}
  multipart_chunksize = ${DEFAULT_MULTIPART_CHUNKSIZE}
  max_queue_size = ${DEFAULT_MAX_QUEUE}
`;
    
    fs.writeFileSync(tempConfigFile, configContent);
    custom_logging(`Created temporary AWS config at: ${tempConfigFile}`);

    const checkAwsCli = spawn('which', ['aws']);
    
    checkAwsCli.on('close', (code) => {
      if (code !== 0) {
        fs.rmdirSync(tempConfigDir, { recursive: true });
        return reject(new Error('AWS CLI is not installed or not in PATH. Please install AWS CLI first.'));
      }
      
      const args = [
        's3', 'sync',
        `s3://${sourceBucket}/${prefix}`,
        `s3://${targetBucket}/${prefix}`,
        '--region', targetRegion,
        '--source-region', sourceRegion,
        '--sse',
        '--only-show-errors',
        '--cli-connect-timeout', '30',
        '--profile', 's3transfer'
      ];

      if (deleteExtraFiles) {
        args.push('--delete');
      }

      custom_logging(`Starting S3 sync: aws ${args.join(' ')}`);

      const env = {
        ...process.env,
        AWS_CONFIG_FILE: tempConfigFile,
        AWS_REGION: targetRegion,
        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
        AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN
      };

      const awsProcess = spawn('aws', args, { env });
      
      let stdoutData = '';
      let stderrData = '';

      awsProcess.stdout.on('data', (data) => {
        stdoutData += data.toString();
        custom_logging(`[S3 SYNC] ${data.toString().trim()}`);
      });

      awsProcess.stderr.on('data', (data) => {
        stderrData += data.toString();
        custom_logging(`[S3 SYNC ERROR] ${data.toString().trim()}`);
      });

      awsProcess.on('close', (code) => {
        try {
          fs.rmSync(tempConfigDir, { recursive: true });
        } catch (err) {
          custom_logging(`Error cleaning up temp config: ${err.message}`);
        }
        
        if (code === 0) {
          custom_logging(`S3 sync completed successfully from ${sourceBucket} to ${targetBucket}`);
          resolve({
            success: true,
            output: stdoutData
          });
        } else {
          custom_logging(`S3 sync failed with code ${code} from ${sourceBucket} to ${targetBucket}`);
          reject(new Error(`S3 sync failed: ${stderrData}`));
        }
      });
    });
  });
};


module.exports = {
  putBucketNotificationConfiguration,
  getBucketNotificationConfiguration,
  deleteBucketNotificationConfiguration,
  getObjectsCount,
  syncS3Buckets
 };