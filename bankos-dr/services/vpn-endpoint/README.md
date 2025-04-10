# VPN Endpoint Route Switching

## Overview
This script (run-vpn.js) is designed to automate the switching of IP routes between Active and Failover VPN endpoints across AWS regions. It ensures that IP routes are properly transferred between environments during failover events or environment restoration.

The script dynamically determines whether to perform actual changes or simulate them based on environment variables passed through the Jenkins pipeline (Jenkinsfile).

## How It Works
### Configuration Check
Before execution, run-vpn.js checks:

Whether DRY_RUN mode is enabled (to simulate actions without applying changes).
Whether to process the current environment alongside the switching action.
These values are injected via Jenkins at runtime, ensuring environment-specific control over execution.

## Switching Logic
### Switching from Active to Failover Region
When switching from Active to Failover, the following steps occur:

The script reads the client-specific configuration file to obtain:

active_vpn_endpoint_id — ID of the active VPN endpoint.
failover_vpn_endpoint_id — ID of the failover VPN endpoint.
ip_list — List of IP routes to manage.
### Actions performed:

Remove IP routes (listed in ip_list) from the Active VPN endpoint.
Add those same IP routes to the Failover VPN endpoint.

### Note:

If a VPN endpoint contains more IP routes than those specified in the ip_list, only the IPs listed in the configuration will be modified.
All other IP routes attached to the endpoint will remain unaffected.

### Switching from Failover to Active Region
When switching from Failover back to Active, the following steps occur:

The script reads the same client-specific configuration file to obtain:

failover_vpn_endpoint_id — ID of the failover VPN endpoint.
active_vpn_endpoint_id — ID of the active VPN endpoint.
ip_list — List of IP routes to manage.
Actions performed:

Remove IP routes (listed in ip_list) from the Failover VPN endpoint.
Add those same IP routes back to the Active VPN endpoint.

### Note:

As with switching to Failover, only the IPs listed in ip_list are affected.
Other IP routes not mentioned in the configuration will remain untouched.

## Important Notes

### DRY_RUN Mode: 
When enabled, actions are logged but no real changes are made to VPN routes.

### Current Environment Processing: 
When enabled, the script can also remove IPs from the current environment's endpoint, making the switch more complete.

### IP List Enforcement: 
Only IP addresses listed in the configuration file are acted upon. Any additional IPs attached to the VPN endpoints are not modified.
