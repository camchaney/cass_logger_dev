"""
Example: Download and plot suspension travel data from a Cass Logger recording.

This script shows a simple example of how to load binary files

Workflow
--------
1. ``import_data`` — loads a pre-downloaded ``.bin`` file from the
   ``examples/data/`` directory and parses it into a DataFrame using
   ``CassCommands.process_data_file``.
2. ``plot_data`` — applies the ADC-to-millimetre gain constants and
   displays a two-panel time-series plot.

Data columns used
-----------------
- ``t``  : elapsed time in seconds (derived from the ``tmicros`` field)
- ``a0`` : fork potentiometer raw ADC reading (scaled by ``FORK_GAIN``)
- ``b0`` : shock potentiometer raw ADC reading (scaled by ``SHOCK_GAIN``)

Constants
---------
FORK_GAIN : float
    Converts raw ``a0`` ADC counts to millimetres of fork travel.
SHOCK_GAIN : float
    Converts raw ``b0`` ADC counts to millimetres of shock travel.

Notes
-----
- The example ``.bin`` file must already exist in ``examples/data/``.
  To download live data from a connected device use
  ``CassCommands.download_all()`` instead.
- ``process_data_file`` defaults to the ``"std"`` firmware dtype; pass
  the ``fw_ver`` keyword if the file was recorded with an I2C firmware
  variant.

Usage
-----
Run directly::

    python examples/download_and_process_example.py
"""

import src.cass_commands as cass_commands
from pathlib import Path
from matplotlib import pyplot as plt
import pandas as pd

FORK_GAIN = 4.884e-02
SHOCK_GAIN = 2.442e-02


def download_data():
    cass_util = cass_commands.CassCommands()
    data_dir = cass_util.download_all()
    print(f"Data downloaded to: {data_dir}")
    return data_dir


def import_data():
    """Load and parse the example binary data file.

    Locates the pre-bundled ``.bin`` file in ``examples/data/``,
    parses it with ``CassCommands.process_data_file``, and returns
    the result as a DataFrame.

    Returns
    -------
    pd.DataFrame
        Parsed sensor data with columns including ``t`` (seconds),
        ``a0`` (fork pot ADC counts), and ``b0`` (shock pot ADC counts).
    """
    cass_util = cass_commands.CassCommands()
    filepath = str(
        Path(__file__).parent / "data" / "97b9d0e5-345d-422f-95ea-24f48d067590.bin"
    )

    return cass_util.process_data_file(filepath)


def plot_data(example_data: pd.DataFrame):
    """Plot fork and shock suspension travel against time.

    Applies the ADC-to-millimetre gain constants to the raw potentiometer
    channels and renders a two-panel time-series figure using matplotlib.

    Parameters
    ----------
    example_data : pd.DataFrame
        DataFrame returned by ``import_data``. Must contain columns
        ``t``, ``a0``, and ``b0``.
    """
    plt.style.use("ggplot")

    fig, axs = plt.subplots(nrows=2, ncols=1, sharex=True, figsize=(12, 8))
    for ax in axs:
        ax.tick_params(axis="x", labelbottom=True)
    axs[0].plot(example_data["t"], example_data["a0"] * FORK_GAIN)
    axs[1].plot(example_data["t"], example_data["b0"] * SHOCK_GAIN)

    # labeling / formatting
    axs[0].set_title("[Example] Fork Pot")
    axs[1].set_title("[Example] Shock Pot")
    plt.title("Example data plot")
    axs[0].set_xlabel("time [s]")
    axs[0].set_ylabel("Travel [mm]")
    axs[1].set_xlabel("time [s]")
    axs[1].set_ylabel("Travel [mm]")

    plt.tight_layout()
    plt.show()


if __name__ == "__main__":
    example_data = import_data()
    plot_data(example_data)
