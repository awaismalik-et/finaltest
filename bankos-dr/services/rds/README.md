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
- RDS configurations will be updated as needed.

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
`replica_configuration` object in the active configuration only, having identifier value which is the name of the read replica of the primary instance in active region. This name would be used to check the name of the replica of a database instance if a instance that has to be cloned in the other region if there is no replica, simply omit defining the `replica_configuration` object in the configuration. It can be defined either in active configuration or failover configuration depending upon the switch th econfiguration.json should be handled correctly.

Also, checks if the `replica_configuration` identifier is correct, otherwise if its incorrect, the pipeline will give an error

The replica should always exist, otherwise the program will stop by saying the read replica doesnt exist. Then, we create a read replica of the newly promoted instance. Now, there are a primary and replica in both regions. The proxies are updated and pointed as well. Now if we have checked the `process_current_environment` flag in the jenkinsfile then the failover region database group primary instance would have a timestamp appended to it. And the replica of the freshly promoted instance in the failover region creates a read replica in the active region 

The read replica should always exists, in case of a single instance DB as well and then it promotes and updates proxies. If `process_current_environment` is checked then we rename the instance with timestamp appended to it and the read replica of failover in active region creation happens.


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

The replica should always exist, otherwise the program will stop by saying the read replica doesnt exist. Then, we create a read replica of the newly promoted instance. Then, we create a read replica of the newly promoted instance. Now, there are a primary and replica in both regions. The proxies are updated and pointed as well. Now if we have checked the `process_current_environment` flag in the jenkinsfile then the failover region database group primary instance would have a timestamp appended to it. And the replica of the freshly promoted instance in the active region creates a read replica in the failover region 

If there is only a primary instance in failover, then it checks if the read replica exists in the active, if it does it promotes and if it doesn't it would throw an error and then promotes the replica and updates proxies. If `process_current_environment` is checked then it rename the instance with timestamp appended to it and the read replica of active in failover creation happens.

### Note:
Only the RDS instances defined in the configuration are affected.

### Important Notes

#### Process Current Environment:

When enabled, the script can also update and clean up settings related to the current active environment, making the switching process complete and consistent.