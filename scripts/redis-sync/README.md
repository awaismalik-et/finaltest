# Redis Cluster Migration Script

## Requirements

- Python version: 3.13
- Redis version: 6.4.0

## Configuration

- Endpoints and ports for source and destination Redis clusters are set in the `configuration.json` file.
- Each entry in the JSON should define the `active_server` and `failover_server`.

Example structure:
{
  "redis": [
    {
      "active_server": { "endpoint": "source-host", "port": 6379 },
      "failover_server": { "endpoint": "destination-host", "port": 6379 }
    }
  ]
}

## Usage

Run the script with the required `--switching-to` flag to specify the target cluster:

python3 script.py --switching-to active

### Optional Flags

- --cleanup : If set, the script will clean (FLUSHALL) the destination Redis cluster before migrating.

Example with cleanup:

python3 script.py --switching-to failover --cleanup

## Notes

- Make sure the source and destination clusters are reachable.
- The script will migrate all keys from source to destination. Existing keys in the destination will be replaced if they conflict.
- Use --switching-to to indicate whether you are switching to active or failover. This is mandatory.
