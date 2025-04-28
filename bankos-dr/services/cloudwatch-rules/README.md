# Cloudwatch Rules Switching
## Overview
This script (main.js) is designed to automate the switching of AWS Cloudwatch rules between Active and Failover environments.

It ensures that during a failover event or environment restoration, Cloudwatch rules are enabled or disabled in the appropriate regions to control event flow correctly.

The script also supports:

 Dry-run mode for safe simulations.
Option to process the current environment, both dynamically controlled via the Jenkins pipeline (Jenkinsfile).
## How It Works
1. Configuration Check
Before execution, run-eventbridge.js performs the following checks:

### DRY_RUN Mode:
Determines whether to simulate actions without applying real changes.

### Process Current Environment:
Specifies whether to disable rules in the currently active region when switching to another environment.

Both options are dynamically injected by Jenkins at runtime to ensure environment-specific control and safety.

## Switching Logic
### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file to obtain:

List of Cloudwatch rules in both Active and Failover regions.
### Actions performed:
Excludes the rules of specified buses to not be processed that are mentioned in the configuration.json

List all EventBridge event buses and rules in the Failover region.

Enable all relevant Cloudwatch rules in the Failover region.

If --processCurrentEnvironment is enabled, disable all relevant Cloudwatch rules in the Active region.
AWS-managed rules are skipped to prevent unintended modifications.

This ensures that:

Failover region Cloudwatch rules are active and ready to handle events.

Active region Cloudwatch rules are disabled, preventing duplicate or conflicting event processing.

### Note:
Only Cloudwatch rules listed in the configuration are affected.

Other AWS-managed or unrelated rules remain untouched.

## Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads the same common configuration file to obtain:

List of Cloudwatch rules in both Failover and Active regions.

### Actions performed:
Excludes the rules of specified buses to not be processed that are mentioned in the configuration.json

List all EventBridge event buses and rules in the Active region.

Enable all relevant Cloudwatch rules in the Active region.

If --processCurrentEnvironment is enabled, disable all relevant Cloudwatch rules in the Failover region.

AWS-managed rules are skipped to avoid errors.

This ensures that:

Active region Cloudwatch rules are enabled and handling events.

Failover region Cloudwatch rules are disabled to prevent conflicts.

### Note:
Only Cloudwatch rules specified in the configuration are modified.

All other rules, including AWS-managed, remain unaffected.



### Important Notes
#### DRY_RUN Mode:
When enabled, all actions are logged but no real changes are applied to Cloudwatch rules — useful for validation and testing.
#### Process Current Environment:
When enabled, the script disables rules in the currently active environment, ensuring a complete switch without conflicts.
#### Targeted Modifications:
Only Cloudwatch rules specified in the configuration file are affected.
AWS-managed rules are automatically skipped to prevent accidental modification of system rules.
#### Process Common Config
Includes the common folder client for configuration, otherwise the jenkins pipeline would not handle any clients.