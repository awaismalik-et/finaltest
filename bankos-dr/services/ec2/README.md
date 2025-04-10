# EC2 Instance Switching

## Overview
This script (run-ec2-instance.js) is designed to automate the stopping and starting  of EC2 instance between Active and Failover EC2 across AWS regions. It ensures that ec2 instances are properly stopped between environments during failover events or environment restoration.

The script dynamically determines whether to perform actual changes or simulate them based on environment variables passed through the Jenkins pipeline (Jenkinsfile).

## How It Works
### Configuration Check
Before execution, run-ec2-instance.js checks:

Whether DRY_RUN mode is enabled (to simulate actions without applying changes).
Whether to process the current environment alongside the switching action.
These values are injected via Jenkins at runtime, ensuring environment-specific control over execution.

## Switching Logic
### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads the common configuration file to obtain:

active_instance_id — ID of instances in the active region.
failover_instance_id — ID of instances in the failover region.

### Actions performed:

Stop Ec2 Instance  in the Active region.
Start Ec2 Instance  in the Failover region.

### Note:

Only instance ids present in the active_instance_id are effected by this 

### Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads the same common configuration file to obtain:

active_instance_id — ID of instances in the active region.
failover_instance_id — ID of instances in the failover region.

### Actions performed:

Stop Ec2 Instance  in the Failover region.
Start Ec2 Instance  in the Active region.

### Note:

Only instance ids present in the failover_instance_id are effected by this 


## Important Notes

### DRY_RUN Mode: 
When enabled, actions are logged but no real changes are made to ec2 instances.

### Current Environment Processing:
When enabled, the script can also stops the instance from the current environment instances, making the switch more complete.
