# Cloudfront Switching

## Overview
This script (main.js) is designed to automate the switching of CloudFront behaviors and origins between Active and Failover environments. It ensures that during a failover event or environment restoration, CloudFront distributions are updated to serve traffic from the correct environment (Active or Failover).

The script also supports a dry-run mode for safe testing and a flag to decide whether to process the current environment, both of which are dynamically controlled via the Jenkins pipeline (Jenkinsfile).


## How It Works
Configuration Check
Before execution, main.js performs the following checks:

### DRY_RUN mode: 

To determine whether to simulate actions without applying changes.
Process Current Environment: 

To decide whether to apply changes to the currently active environment as part of the switching.

Both options are injected dynamically via Jenkins during pipeline execution to control the script's behavior in different deployment scenarios.

## Multi-Client Handling

This script supports processing **multiple clients dynamically** based on the CLIENT_NAME parameter passed through the Jenkins pipeline.

### How It Works

The CLIENT_NAME parameter can be set to:
  - A specific client name (e.g., `FED`, `RTP`, etc.)
  - `All` — which triggers the script to run for all configured clients.

Additionally, enabling `PROCESS_COMMON_CONFIG` will add the **common configuration** to the client list for processing.

### Example Behaviors

| CLIENT_NAME | PROCESS_COMMON_CONFIG | Clients Processed                                      |
|-------------|------------------------|--------------------------------------------------------|
| `FED`       | `false`                | `FED`                                                  |
| `All`       | `false`                | `FED`, `RTP`, `FED-ACH`, `sample-client`              |
| `All`       | `true`                 | `FED`, `RTP`, `FED-ACH`, `sample-client`, `common`    |
| `RTP`       | `true`                 | `RTP`, `common`                                        |

For each client in the list:
- The script will be executed separately.
- CloudFront configurations will be updated as needed.

### Switching Logic
#### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file and a client specific configuration to obtain:

CloudFront distribution ID.

Active origin and behavior IDs.
Failover origin and behavior IDs.


#### Actions performed:

Update CloudFront distribution to replace the Active origin and behavior with the Failover origin and behavior.
This ensures CloudFront starts routing traffic to the failover environment.

#### ⚠️ Note:

Only the origin and behaviors specified in the configuration are modified.

Other configurations within the CloudFront distribution remain unchanged.

#### Switching from Failover to Active Region

When switching from Failover back to Active, the following steps occur:

The script reads the common configuration file and a client specific configuration to obtain:

CloudFront distribution ID.

Failover origin and behavior IDs.

Active origin and behavior IDs.

#### Actions performed:

Stop Ec2 Instance  in the Failover region.
Start Ec2 Instance  in the Active region.

#### Note:

As with switching to Failover, only the specified origin and behavior IDs are updated.

All other distribution settings remain unaffected.

### Important Notes

#### DRY_RUN Mode:

When enabled, all planned actions are logged but no real changes are applied to CloudFront distributions — useful for testing and validation.

