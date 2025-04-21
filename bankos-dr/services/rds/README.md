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
If there are no replica in the failover region and both the primary instance and the replica exists in the active region. Then, the code will check this through the `replica_configuration` object in the `configuration.json`. If the replica_configuration has an identifier in it, this means the replica and the primary instance are in the active region. Then,
the first action would be to create a replica in the failover region from the primary instance in the active region.

Promote Failover RDS to be the new standalone primary instance (remove replication status if it was a replica).

update the proxy in the failover region
This ensures that:

Failover RDS becomes the new primary instance, ready to handle production traffic.
Active region RDS remains untouched unless a manual restoration is triggered later.

The previous RDS instane has "old" appended to its name
The read replica of the newly promoted RDS is made in the active region 
### Note:
Only the RDS instances defined in the configuration are modified.
No other RDS instances or databases are affected.

### Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads a common configuration file and client-specific configuration to obtain:

Active RDS configuration — Target configuration for Active region.

Failover RDS configuration — Current running RDS in Failover region.

### Actions performed:
Check if an RDS instance already exists in the Active region:

If it exists and force_delete is false →  Fail the operation to avoid accidental overrides.

If it exists and force_delete is true →  Delete the existing Active RDS.

Create a replica of the Failover RDS in the Active region.

Promote the new Active RDS to a standalone instance.

Update the proxy to point to the freshly promoted instance.

Prompt user to confirm updating application configuration (e.g., connection strings, endpoints).

Active region RDS becomes the new primary.

Failover RDS name is now appended with "old" to be identifed as a old version and  with a fresh replica of the new Active RDS, maintaining high availability.

### Note:
Only the RDS instances defined in the configuration are affected.
All actions are subject to force_delete flag and explicit user confirmation.


### Important Notes

#### Process Current Environment:

When enabled, the script can also update and clean up settings related to the current active environment, making the switching process complete and consistent.

#### Force Delete Handling:
The force_delete flag governs whether an existing RDS instance in Active region can be automatically deleted to allow failover switching:

true: Allows deletion and re-creation.

false: Prevents deletion and fails the process if RDS exists.