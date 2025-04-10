# RDS Switching

## Overview
This script (run-rds.js) is designed to automate the switching of RDS instances between Active and Failover environments.

It ensures that during a failover event or environment restoration, RDS instances are promoted, replicated, or cleaned up according to the intended environment (Active or Failover).

The script also supports:

Option to process the current environment is controlled via the Jenkins pipeline (Jenkinsfile).
## How It Works
### Configuration Check
Before execution, run-rds.js performs the following checks:

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
Promote Failover RDS to be the new standalone primary instance (remove replication status if it was a replica).

update the proxy in the failover region
This ensures that:

Failover RDS becomes the new primary instance, ready to handle production traffic.
Active region RDS remains untouched unless a manual restoration is triggered later.
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

Prompt user to confirm updating application configuration (e.g., connection strings, endpoints).

Upon user confirmation:

If the user approves:

 Delete the Failover RDS.

 Create a replica of the newly promoted Active RDS back to the Failover region for future failover readiness.

This ensures that:

Active region RDS becomes the new primary.

Failover RDS is decommissioned and replaced with a 
fresh replica of the new Active RDS, maintaining high availability.
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
