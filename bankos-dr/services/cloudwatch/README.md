# Cloudwatch Switching

## Overview
This script (run-cloudwatch.js) is designed to automate the switching of lambda concurrency and eventbridge rules . It ensures that during a failover event or environment restoration, Lambda concurrency is set to 0 and eventbridge rules are turned off for the correct environment (Active or Failover).

The script also supports a dry-run mode for safe testing and a flag to decide whether to process the current environment, both of which are dynamically controlled via the Jenkins pipeline (Jenkinsfile).



## How It Works
Configuration Check
Before execution, run-cloudwatch.js performs the following checks:

### DRY_RUN mode: 

To determine whether to simulate actions without applying changes.
Process Current Environment: 

To decide whether to apply changes to the currently active environment as part of the switching.

Both options are injected dynamically via Jenkins during pipeline execution to control the script's behavior in different deployment scenarios.

### Switching Logic
#### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file and client specific to obtain:

Active Lambda ARNs — Lambda functions in the Active region.
Failover Lambda ARNs — Lambda functions in the Failover region.

#### Actions performed:
Set Lambda concurrency to 0 (disabled) for all Active Lambda ARNs.
Set Lambda concurrency to 1 (enabled) for all Failover Lambda ARNs.

Search for all the eventbridge rules attached to the lambdas in Active Lambda ARNs and disable them

Search for all the eventbridge rules attached to the lambdas in Failover Lambda ARNs and enable them

This ensures that:

Active environment Lambdas and EventBridge rules are disabled, stopping traffic processing in Active.
Failover environment Lambdas and EventBridge rules are enabled, allowing Failover to handle all traffic.

#### Note:
Only the Lambda ARNs and EventBridge Rule ARNs specified in the configuration are modified.
Any other Lambda functions or EventBridge rules not listed in the configuration remain unaffected.

#### Switching from Failover to Active Region

The script reads a common configuration file and client specific to obtain:

Active Lambda ARNs — Lambda functions in the Active region.
Failover Lambda ARNs — Lambda functions in the Failover region.

#### Actions performed:
Set Lambda concurrency to 0 (disabled) for all Failover Lambda ARNs.
Set Lambda concurrency to 1 (enabled) for all Active Lambda ARNs.

Search for all the eventbridge rules attached to the lambdas in Failover Lambda ARNs and disable them

Search for all the eventbridge rules attached to the lambdas in Active Lambda ARNs and enable them

This ensures that:

Active environment Lambdas and EventBridge rules are enabled, allowing traffic processing in Active.
Failover environment Lambdas and EventBridge rules are disabled, stopping Failover to handle all traffic.

#### Note:
Only the Lambda ARNs and EventBridge Rule ARNs specified in the configuration are modified.
Any other Lambda functions or EventBridge rules not listed in the configuration remain unaffected.


### Important Notes

#### DRY_RUN Mode:

When enabled, all planned actions are logged but no real changes are applied to lambda functions and eventbridge rules — useful for testing and validation.

#### Process Current Environment:

When enabled, the script can also update and clean up settings related to the current active environment, making the switching process complete and consistent.
