import src.cass_commands as cass_commands
from pathlib import Path
from matplotlib import pyplot as plt
import pandas as pd

FORK_GAIN = 4.884e-02
SHOCK_GAIN = 2.442e-02


def import_data():
    cass_util = cass_commands.CassCommands()
    filepath = str(
        Path(__file__).parent / "data" / "97b9d0e5-345d-422f-95ea-24f48d067590.bin"
    )

    return cass_util.process_data_file(filepath)


def plot_data(example_data: pd.DataFrame):
    plt.style.use("ggplot")
    fig, axs = plt.subplots(nrows=2, ncols=1, sharex=True)
    axs[0].plot(example_data["t"], example_data["a0"] * FORK_GAIN)
    axs[0].set_title("Example data: Fork Pot")
    axs[1].plot(example_data["t"], example_data["b0"] * SHOCK_GAIN)
    axs[1].set_title("Example data: Shock Pot")
    plt.title("Example data plot (potentiometer data)")
    axs[0].set_xlabel("time [s]")
    axs[0].set_ylabel("Travel [mm]")
    axs[1].set_xlabel("time [s]")
    axs[1].set_ylabel("Travel [mm]")
    plt.show()


if __name__ == "__main__":
    example_data = import_data()
    plot_data(example_data)
