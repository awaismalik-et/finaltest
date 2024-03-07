
# Usage Guide

This guide explains how to use the provided JSON configuration to manage AWS resources.

## Requirements

Node.js

AWS crendetials

## Configuration JSON
The provided JSON configuration contains settings for managing various AWS resources. Here's what each section represents:

**switching_to**: Indicates the environment to switch to, either "PROD" or "DR".

**active_region**: The AWS region for the active environment.

**failover_region**: The AWS region for the failover environment.

**cloudfront**: Configuration for CloudFront distributions and behaviors.

**id**: The ID of the CloudFront distribution.

**behaviors**: List of behaviors for the CloudFront distribution.

**active_origin**: The active origin for the behavior.

**failover_origin**: The failover origin for the behavior.

**active_lambdas**: Configuration for active environment Lambdas.

**failover_lambdas**: Configuration for failover environment Lambdas.

**type**: Type of Lambdas configuration, the valid values are "arn, prefix and all".

**items**: List of Lambda ARNs, PREFIX for the failover environment.

**vpn_endpoints**: Configuration for VPN endpoints.

**ips**: List of CIDR blocks for VPN endpoints.

**active_vpn_endpoints_id**: List of VPN endpoint IDs for the active environment.

**failover_vpn_endpoints_id**: List of VPN endpoint IDs for the failover environment.


# GLOSSARY
Failover = Disaster Recovery 

Active = PROD
