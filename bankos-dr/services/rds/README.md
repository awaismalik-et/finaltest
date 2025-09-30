# RDS Switching

## Overview
This script (main.js) is designed to automate the switching of RDS instances between Active and Failover environments.

It ensures that during a failover event or environment restoration, RDS instances are promoted, replicated, or cleaned up according to the intended environment (Active or Failover).

The script also supports:

Option to process the current environment is controlled via the Jenkins pipeline (Jenkinsfile).
## How It Works
### Configuration Check
Before execution, main.js performs the following checks:

## Multi-Client Handling

This script supports processing **multiple clients dynamically** based on the CLIENT_NAME parameter passed through the Jenkins pipeline.

### How It Works

The CLIENT_NAME parameter can be set to:
  - A specific client name (e.g., `FED`, `RTP`, etc.)
  - `All` — which triggers the script to run for all configured clients.
  - `None` - which process nothing and throws an error that no CLIENT_NAME was provided.

Added CUSTOM_CLIENT text parameter which lets us define more than one client and process them parallely. Moreover, the 
RESOURCE_BATCH_SIZE parameter lets us define how many resources of rds of a single client to handle at a time and CLIENT_BATCH_SIZE parameters lets us define how many clients ahould be processed in parallel. For instance, if RESOURCE_BATCH_SIZE is defined as 5 and CLIENT_BATCH_SIZE is 2, the two clients would be processed with their rds resources converted in batch of 5 resources at a single time to be processed.

Additionally, enabling `PROCESS_COMMON_CONFIG` will add the **common configuration** to the client list for processing.

### Example Behaviors

| CLIENT_NAME | PROCESS_COMMON_CONFIG | Clients Processed                                       |
|-------------|------------------------|--------------------------------------------------------|
| `FED`       | `false`                | `FED`                                                  |
| `All`       | `false`                | `FED`, `RTP`, `FED-ACH`, `sample-client`               |
| `All`       | `true`                 | `FED`, `RTP`, `FED-ACH`, `sample-client`, `common`     |
| `RTP`       | `true`                 | `RTP`, `common`                                        |
| `None`      | `true`                 | `common`                                               |
| `None`      | `false`                |                                                        |


For each client in the list:
- The script will be executed separately.
- RDS configurations will be updated as needed.

You can view the stges and steps runnning parallely according to your configuration and parameters, either in the pipeline overview or the stage view.

#### Process Current Environment:
Specifies whether to also handle cleanup or verification for the currently active environment.

These options are injected via Jenkins during runtime for flexible and safe operations.

## Switching Logic
### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads a common configuration file and client-specific configuration to obtain:

Active RDS configuration — Details for RDS in Active region.

Failover RDS configuration — Details for RDS in Failover region.

### Actions performed:
If the active RDS instance have read replica already configured with the source, then the configuration.json should have a
`replica_configuration` object, having identifier value which is the name of the read replica of the primary instance in active region.

Now, then we check if the primary instance in the active region has a read replica in the failover region. If it does, we dont create it, rather just promotes it and becomes a standlone instance. Then, we create a read replica of the newly promoted instance. Now, there are a primary and replica in both regions. The proxies are updated and pointed as well. Now if we have checked the `process_current_environment` flag in the jenkinsfile then the failover region database group primary instance would have a timestamp appended to it. And the replica of the freshly promoted instance in the failover region creates a read replica in the active region 

If there are no read replicas and only a primary instance in active, then it checks if the read replica exists in the failover, if it does it promotes and if it doesn't it creates and then promotes and updates proxies. If `process_current_environment` then the rename with timestamp appended and the read replica of failover in active creation happens.

### Note:
Only the RDS instances defined in the configuration are modified.
No other RDS instances or databases are affected.

### Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads a common configuration file and client-specific configuration to obtain:

Active RDS configuration — Target configuration for Active region.

Failover RDS configuration — Current running RDS in Failover region.

### Actions performed:
If the failover RDS instance have read replica already configured with the source, then the configuration.json should have a
`replica_configuration` object, having identifier value which is the name of the read replica of the primary instance in failover.

Now, then we check if the primary instance in the failover region has a read replica in the active region. If it does, we dont create it, rather just promotes it and becomes a standlone instance. Then, we create a read replica of the newly promoted instance. Now, there are a primary and replica in both regions. The proxies are updated and pointed as well. Now if we have checked the `process_current_environment` flag in the jenkinsfile then the failover region database group primary instance would have a timestamp appended to it. And the replica of the freshly promoted instance in the active region creates a read replica in the failover region 

If there are no read replicas and only a primary instance in failover, then it checks if the read replica exists in the active, if it does it promotes and if it doesn't it creates and then promotes and updates proxies. If `process_current_environment` then the rename with timestamp appended and the read replica of active in failover creation happens.

### Important Notes

#### Process Current Environment:

When enabled, the script can also update and clean up settings related to the current active environment, making the switching process complete and consistent.
