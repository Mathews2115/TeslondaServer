# Teslonda Server App
## Backend Server for Teslonda Dash
- [Teslonda Front-end](https://github.com/Mathews2115/TeslondaDash)
- [RaspberryPi setup](https://gist.github.com/Mathews2115/ed3dbd8623ee815a7bed363dbc7c73a6)

## Workflow
1. Compile [Teslonda Front-end](https://github.com/Mathews2115/TeslondaDash)
2. Copy to the `public/dist` directory on the server of the Raspberry Pi3
3. Run the server!

## Quick note:
This was a pet project that was made in rapid prototype fashion due to massive time constraints;  there are no tests, there are plenty of style guide violations as this was my first NodeJs project.  This was uploaded without curation so I apologize for the possible curse words, bugs and bad form you might come across.  There are no hard-tabs though, so there is that.

This comes preloaded with a version of the Teslonda Dash ready to rumble.

## Overview
This launches a webserver that will serve up the Front-end dash content as well as launch a Node app that will listen to CAN from a HSR (look up Jason Hughes HSR) Controller.

## Web Socket packets
It's imporant to group data up in "frame" packets;  deliver relevant data every 16ms (equilivant to 60fps) as to not drown the front-end in data; the Raspberry Pi 3 is pretty dang capable but when a busy clunky frontend like a chromium web-app receives socket data, a lot happens each time data comes in, and will quickly bog things down if it isn't regulated.   

# Install
* on your raspberry pi
1. copy all contents to `can-server` 
2. Prepare Dev enviroment on RPI: run `./RPI_system/prepare_dev.sh`
3. Or prepare production environment: run `./RPI_system/prepare_production.sh`

# General
* The front-end web content is stored in `public/dist`.  The source can be found at https://github.com/Mathews2115/TeslondaDash.
* `npm run vcan_server` - auto installs interfaces and run virtual-CAN and test server
* `npm run can_server` - auto installs interfaces and runs production CAN server
* [Teslonda Front-end](https://github.com/Mathews2115/TeslondaDash) served on`localhost:3333`
* Websocket Server listening to `localhost:4000`

## To Debug Live
* `npm run can_server` - to get main web server and can server up and running
* Get the Pi's IP
* On your local pc, navigate to `[pi's ip]:3333`
* Modify App code in Comm service to connect to `[pi's ip]:4000`

# Additional Setup (PiCAN2)
## PiCAN2 Device Overlays
1. Enable SPI either through `raspi-config` or add `dtparam=spi=on` to `/boot/config.txt`
2. put the following in /boot/config.txt
```
#CAN bus controllers
dtoverlay=mcp2515-can0,oscillator=16000000,interrupt=25
dtoverlay=spi-bcm2835-overlay
```

## to auto-start CAN interface on bootup for Rasperry Pi
* see  https://raspberrypi.stackexchange.com/questions/51829/unable-to-bring-can-interface-up-on-raspberry-pi-3
1. sudo nano /etc/network/interfaces
2. Paste this
```
auto can0
iface can0 inet manual
   pre-up /sbin/ip link set can0 type can bitrate 500000 triple-sampling on
   up /sbin/ifconfig can0 up
   down /sbin/ifconfig can0 down
```

## NETWORKING SETUP
https://gist.github.com/Mathews2115/3be0b1173be222e73ba4d8181558d409
