import json
import argparse
from redis.cluster import RedisCluster

def can_connect(endpoint, port):
    can_connect = False
    try:
        r = RedisCluster(host=endpoint, port=port, decode_responses=False, skip_full_coverage_check=True, ssl=True,ssl_cert_reqs=None)
        r.ping()
        can_connect = True
    except Exception as e:
        print(f"Cannot connect to {endpoint}:{port} -> {e}")
    finally:
        return can_connect


def cleanup_destination(dst_endpoint, dst_port):
    try:
        dst = RedisCluster(host=dst_endpoint, port=dst_port, decode_responses=False, skip_full_coverage_check=True, ssl=True,ssl_cert_reqs=None)
        print(f"Cleaning up destination {dst_endpoint}:{dst_port} (FLUSHALL)...")
        dst.flushall()
        print("Destination cleanup complete.")
    except Exception as e:
        print(f"Failed to cleanup destination {dst_endpoint}:{dst_port} -> {e}")
   

def migrate(src_endpoint, src_port, dst_endpoint, dst_port, cleanup=False):
    print(f"Starting Redis migration from {src_endpoint} -> {dst_endpoint}")
    try:
        src = RedisCluster(host=src_endpoint, port=src_port, decode_responses=False, skip_full_coverage_check=True, ssl=True,ssl_cert_reqs=None)
        dst = RedisCluster(host=dst_endpoint, port=dst_port, decode_responses=False, skip_full_coverage_check=True, ssl=True,ssl_cert_reqs=None)
    except Exception as e:
        print(f"Skipping migration {src_endpoint} -> {dst_endpoint}: {e}")
        return
    
    if cleanup:
        cleanup_destination(dst_endpoint, dst_port)

    count = 0
    try:
        for key in src.scan_iter(count=1000):
            ttl = src.ttl(key)
            if ttl < 0:
                ttl = 0
            try:
                value = src.dump(key)
                dst.restore(key, ttl * 1000, value, replace=True)   #REPLACE = TRUE replaces the existing keys in the destination
                count += 1
            except Exception as e:
                print(f"Failed to restore key {key}: {e}")
    except Exception as e:
        print(f"Error during scan/restore loop: {e}")
    print(f"Migration finished: {count} keys migrated\n")


def main():
    try:
        parser = argparse.ArgumentParser(description="Redis Cluster Migration Script")
        parser.add_argument(
            "--switching-to",
            choices=["active", "failover"],
            required=True,
            help="Target cluster: 'active' or 'failover'"
        )
        parser.add_argument(
            "--cleanup",
            action="store_true",
            help="Cleanup destination before migration (default: False)"
        )
        args = parser.parse_args()

        with open("configuration.json", "r") as f:
            config = json.load(f)

        for idx, entry in enumerate(config["redis"], start=1):
            if args.switching_to == "failover":
                src = entry["active_server"]
                dst = entry["failover_server"]
            else:  # switching to active
                src = entry["failover_server"]
                dst = entry["active_server"]

            print(f"\nMigration {idx}: {src['endpoint']}:{src['port']} -> {dst['endpoint']}:{dst['port']}")

            try:
                if can_connect(src["endpoint"], src["port"]) and can_connect(dst["endpoint"], dst["port"]):
                    migrate(src["endpoint"], src["port"], dst["endpoint"], dst["port"], cleanup=args.cleanup)
                else:
                    print(f"Skipping migration {idx} due to unreachable endpoint(s).")
            except Exception as e:
                print(f"Error during migration {idx}: {e}")
    except Exception as e:
        print(f"Error in main: {e}")


if __name__ == "__main__":
    try:
        main()
    except Exception as e:
        print(f"Fatal error in script: {e}")
