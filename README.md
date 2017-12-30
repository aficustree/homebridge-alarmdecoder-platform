# homebridge-alarmdecoder-platform

Homebridge dynamic platform plugin for the alarmdecoder (alarmdecoder.com) interface to Honeywell/DSC Systems. It requires a functioning alarmdecoder-webapp (https://www.alarmdecoder.com/wiki/index.php/AlarmDecoder_WebApp) for the homebridge plugin to contact (via the rest API). Please make sure your webapp is updated with the latest alarmdecoder python package. 

This plugin exposes the security system and any configured contact sensors or motion sensors (i.e., the security system's zones) to HomeKit/Homebridge for use in further automations. 

The alarmdecoder webui must be setup to push alarm events and zone status changes using the enclosed directions.

**IMPORTANT** The name of the zone in the AlarmDecoder WebUI must have the word 'motion', 'smoke' or 'carbon' in the name for the plugin to use the special motion, smoke or carbon monoxide services, otherwise all zones will load as contact sensors. You can name the zones in `settings->zones->zone name`. Contact sensors are the default so you don't have to put 'contact' in the name anywhere.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install homebridge-alarmdecoder using: `npm install -g git+https://github.com/aficustree/homebridge-alarmdecoder-platform#master`
3. Update your configuration file. See sample-config.json in this repository for a sample. 

## Configuration
This module requires that the URLs for getting and setting the security system's state are configured correctly. This has to be done in Homebridge's config.json. 
You can find a sample configuration file in this repository. 

The configuration options are the following:

Configuration example with explanation

```
    "platforms": [
        {
            "platform" : "alarmdecoder-platform",
            "name" : "Alarm System",
            "port" : "PORT TO LISTEN ON",
            "key" : "YOUR API KEY FROM ALARMDECODER GUI",
            "stateURL" : "http://YOURIP:YOURPORT/api/v1/alarmdecoder",
            "zoneURL" : "http://YOURIP:YOURPORT/api/v1/zones",
            "setURL" : "http://YOURIP:YOURPORT/api/v1/alarmdecoder/send",
            "setPIN" : "YOUR PIN"
        }
    ]

```

- The **name** parameter determines the name of the security system you will see in HomeKit.
- the **key** parameter reflects the API key from the alarmdecoder GUI
- The **port** parameter reflects the port the alarmdecoder-sensor will listen for updates from alarmdecoder GUI
- The **stateURL**, **zoneURL** and **setURL** entries show the URL that the plugin will query for the list of zones, the state of the alarm system (and all faulted zones) and the URL to send virtual keypresses. Replcae YOURIP and YOURPORT with the IP and port of the alarmdecoder-webgui interface.
- The **setPIN** is your PIN that you use to arm/disarm the system. Only type the base pin, do not add the arm/disarm button press (i.e., if you arm the system by typing 12342, your pin is 1234)

## Configuration of Alarmedecoder GUI
- Go to your installation of the Alarmdecoder GUI
- Go to settings
- Notifications
- Create a new `custom` notification
- Select / Tick the following:
    - Alarm system is triggered
    - Alarm system stops signaling
    - A panic has been detected
    - A fire is detected
    - Alarm system is armed
    - Alarm system is disarmed
    - A zone has faulted
    - A zone has been restored
- Under 'custom settings'
- URL = the ip address of your homebridge
- Port = the port as specified above
- Method = Post


