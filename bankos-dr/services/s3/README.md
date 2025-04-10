# S3 Event Notification Switching (Failover Automation)
## Overview
This script (main.js) is designed to automate the switching of S3 event notifications between Active and Failover environments during a failover or environment restoration.

It ensures that event notifications (such as Lambda triggers) attached to S3 buckets are properly copied, updated, enabled, or disabled in the correct environment based on the failover state.

The script also supports:

Dry-run mode for safe testing and validation.

Option to process the current environment, dynamically controlled via Jenkins pipeline (Jenkinsfile).
## How It Works
### Configuration Check
Before execution, run-s3.js performs the following checks:

### DRY_RUN Mode:
Determines whether to simulate actions without applying real changes to S3 buckets.

### Process Current Environment:
Specifies whether to remove event notifications from the previously active environment when switching.

These options are dynamically injected via Jenkins pipeline at runtime to ensure safe, environment-specific behavior.

## Switching Logic
### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file to obtain:

Source S3 bucket (Active) — The bucket currently handling events.

Target S3 bucket (Failover) — The bucket that will handle events after switching.

### Actions performed:
Fetch event notifications from the Active S3 bucket.

Update ARNs inside event notifications to match the 

Failover region resources (e.g., Lambda ARNs, SNS topics, SQS ARNs).

Apply updated event notification configuration to the Failover S3 bucket.

If --processCurrentEnvironment is enabled:
Remove event notifications from the Active S3 bucket to prevent duplicate triggers.
This ensures that:

Failover S3 bucket becomes active and starts triggering events.

Active S3 bucket is disabled, preventing conflicts or duplicate events.
### Note:
Only the event notifications specified in the configuration file are modified.

Unrelated S3 bucket settings or other event configurations remain untouched.

### Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads the same configuration file to obtain:

Source S3 bucket (Failover) — The current active bucket.

Target S3 bucket (Active) — The bucket to restore as primary.

### Actions performed:

Fetch event notifications from the Failover S3 bucket.

Update ARNs inside event notifications to match the 
Active region resources.

Apply updated event notification configuration to the 
Active S3 bucket.

If --processCurrentEnvironment is enabled:
Remove event notifications from the Failover S3 bucket.

This ensures that:

Active S3 bucket is restored to handle event triggers.

Failover S3 bucket is disabled, preventing conflicting triggers.

### Note:
Only event notifications listed in the configuration are affected.
Other configurations remain intact.

## Important Notes
### DRY_RUN Mode:
When enabled, all planned actions are logged but no actual changes are made to S3 bucket notifications — perfect for testing and validation.

### Process Current Environment:
When enabled, removes event notifications from the currently active S3 bucket to ensure a clean switch without conflicts.
### Targeted Modifications:
Only S3 event notifications specified in the configuration are modified.
Other S3 settings (e.g., bucket policy, lifecycle rules) remain unaffected.