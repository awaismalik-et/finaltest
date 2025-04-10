# Lambda Switching

## Overview
This script (run-lambda.js) is designed to automate the switching of s3 triggers, sqs. It ensures that during a failover event or environment restoration, Lambda s3 triggers  and sqs is disabled for the correct environment (Active or Failover).

The script also supports a dry-run mode for safe testing and a flag to decide whether to process the current environment, both of which are dynamically controlled via the Jenkins pipeline (Jenkinsfile).



## How It Works
Configuration Check
Before execution, run-lambda.js performs the following checks:

### DRY_RUN mode: 

To determine whether to simulate actions without applying changes.
Process Current Environment: 

To decide whether to apply changes to the currently active environment as part of the switching.

Both options are injected dynamically via Jenkins during pipeline execution to control the script's behavior in different deployment scenarios.

### Switching Logic
#### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file and client-specific configuration to obtain:

active_lambda_triggers — Lambda functions with s3 configuration and sqs in the Active region.
failover_lambda_triggers — Lambda functions with s3 configuration and sqs in the Failover region.

#### Actions performed:
1. Disable S3 triggers and SQS event sources attached to Active Lambda ARNs.
2. Enable S3 triggers and SQS event sources attached to Failover Lambda ARNs.

This ensures that:

1. Active environment Lambda ARNs, S3 triggers and SQS event sources, are fully disabled.
2. Failover environment Lambda ARNs, S3 triggers and SQS event sources, are fully enabled
#### Note:

Only the Lambda ARNs, S3 triggers and SQS event sources, specified in the configuration are modified.
Any other unrelated resources remain unaffected.

#### Switching from Failover to Active Region

When switching from Failover to Failover, the following steps occur:

The script reads a common configuration file and client-specific configuration to obtain:

active_lambda_triggers — Lambda functions with s3 configuration and sqs in the Active region.
failover_lambda_triggers — Lambda functions with s3 configuration and sqs in the Failover region.

#### Actions performed:
1. Disable S3 triggers and SQS event sources attached to Failover Lambda ARNs.
2. Enable S3 triggers and SQS event sources attached to Active Lambda ARNs.

This ensures that:

1. Failover environment Lambda ARNs, S3 triggers and SQS event sources, are fully disabled.
2. Active environment Lambda ARNs, S3 triggers and SQS event sources, are fully enabled
#### Note:

Only the Lambda ARNs, S3 triggers and SQS event sources, specified in the configuration are modified.
Any other unrelated resources remain unaffected.



### Important Notes

#### DRY_RUN Mode:

When enabled, all planned actions are logged but no real changes are applied to Lambda ARNs, S3 triggers and SQS event sources — useful for testing and validation.

#### Process Current Environment:

When enabled, the script can also update and clean up settings related to the current active environment, making the switching process complete and consistent.


