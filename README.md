# homebridge-alarmdecoder-sensor
Homebridge plugin for the alarmdecoder (alarmdecoder.com) interface to Honeywell/DSC Systems. It requires a functioning alarmdecoder-webapp (https://www.alarmdecoder.com/wiki/index.php/AlarmDecoder_WebApp) for the homebridge plugin to contact (via the rest API). Please make sure your webapp is updated with the latest alarmdecoder python package. 

This plugin exposes contact sensors and motion sensors to HomeKit/Homebridge for use in further automations. 

Thea alarmdecoder webui must be setup to push zone status changes using the enclosed directions

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install homebridge-alarmdecoder using: `npm install -g git+https://github.com/aficustree/homebridge-alarmdecoder-sensor.git#master`
3. Update your configuration file. See sample-config.json in this repository for a sample. 

## Configuration
This module requires that the URLs for getting and setting the security system's state are configured correctly. This has to be done in Homebridge's config.json. 
You can find a sample configuration file in this repository. 

The configuration options are the following:

Configuration example with explanation

```
    "accessories": [
        {
            "accessory": "alarmdecoder-sensor",
            "name": "Honeywell Sensors",
            "key": "YOUR API KEY FROM ALARMDECODER GUI",
            "port": "port to listen on for push messages from alarmdecoder",
            "zones": {
                "zone 1": { "url": "/1", "type": "contact" },
                "zone 2": { "url": "/2", "type": "motion" },
                "zone 3": { "url": "/3", "type": "contact" }
            }
        }
    ]

```

- The **name** parameter determines the name of the security system you will see in HomeKit.
- the **key** parameter reflects the API key from the alarmdecoder GUI
- The **port** parameter reflects the port the alarmdecoder-sensor will listen for updates from alarmdecoder GUI
- The **zone** section describes the zones
  - The **url** portion refences the url the alarmdecoder GUI will post to specific for that zone
  - The **type** portion must be either `contact` or `motion` depending on the zone type

## Configuration of Alarmedecoder GUI
Text goes here later

