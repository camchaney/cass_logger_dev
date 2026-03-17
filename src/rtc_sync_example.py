"""Example: read the device RTC time, sync it to UTC, then verify."""

import src.cass_commands as cass_commands


def main():
    cass_util = cass_commands.CassCommands()
    print(cass_util.get_RTC_time())
    print(f"RTC Success = {cass_util.set_RTC_time()}")
    print(cass_util.get_RTC_time())


if __name__ == "__main__":
    main()
