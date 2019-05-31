# homebridge-alarmdecoder-platform

Homebridge dynamic platform plugin for the alarmdecoder (alarmdecoder.com) interface to Honeywell/DSC Systems & Interlogix (formerly GE Security, Caddx, NetworX) Systems.

* For DSC/Homebridge: You must have a functioning [alarmdecoder-webapp](https://www.alarmdecoder.com/wiki/index.php/AlarmDecoder_WebApp) for the homebridge plugin to contact (via the rest API). **Please make sure your webapp is updated** with the latest alarmdecoder python package. The alarmdecoder webui must be setup to push alarm events and zone status changes using the enclosed directions.
* For Interlogix/GE: You must have the Interlogix NX-584E board or a NX8E alarm system and an installed and a working installation of the [NX584 Interface Library](https://github.com/kk7ds/pynx584) built by [kk7ds](https://github.com/kk7ds). Note the *Interlogix branch was written for a friend and is fairly untested, please report any issues*

This plugin exposes the security system and any configured contact sensors or motion sensors (i.e., the security system's zones) to HomeKit/Homebridge for use in further automations.

**IMPORTANT** For Honeywell/DSC systems, the name of the zone in the AlarmDecoder WebUI  or for Interlogix/GE systems, the name within `config.ini` must have the word 'motion', 'smoke' or 'carbon' in the name for the plugin to use the special motion, smoke or carbon monoxide services, otherwise all zones will load as contact sensors. You can name the zones in `settings->zones->zone name`. **Contact sensors are the default** so you don't have to put 'contact' in the name anywhere.

## Installation

1. Install homebridge using: `npm install -g homebridge`
2. Install homebridge-alarmdecoder-platform using: `npm install -g git+https://github.com/aficustree/homebridge-alarmdecoder-platform#master`
3. Update your configuration file. See sample-config.json in this repository for a sample.

## Configuration

This module requires that the URLs for getting and setting the security system's state are configured correctly. This has to be done in Homebridge's config.json.
You can find a sample configuration file in this repository.

The configuration options are the following:

Configuration examples can be as noted:

[DSC Example](./sample-dsc-config.json)

[Honeywell Example](./sample-honeywell-config.json)

[Interlogix/GE/NetworX/Caddx](./sample-interlogix-config.json)

* The **name** parameter determines the name of the security system you will see in HomeKit.
* the **key** parameter reflects the API key from the alarmdecoder GUI (honeywell/DSC only)
* The **port** parameter reflects the port the alarmdecoder-sensor will listen for updates from alarmdecoder GUI
* The **stateURL**, **zoneURL** and **setURL** entries show the URL that the plugin will query for the list of zones, the state of the alarm system (and all faulted zones) and the URL to send virtual keypresses. Replcae YOURIP and YOURPORT with the IP and port of the alarmdecoder-webgui interface.
* The **setPIN** is your PIN that you use to arm/disarm the system. Only type the base pin, do not add the arm/disarm button press (i.e., if you arm the system by typing 12342, your pin is 1234)
* The **useSwitches** provides 'switch' toggles that control the setting of the alarm in away/night/stay mode or to trigger a panic function (or really any arbitrary command). **USING THIS FEATURE FOR AWAY/NIGHT/STAY/DISARM IS A SECURITY RISK (panic and chime are fine)** as you can now control your alarm via Siri without unlocking your iDevice (i.e., if you have a homepod someone could scream 'hey siri, turn off my Alarm Away'). This is useful if you don't care and want to control your alarm through an automation (like a geofence) without authenticating via your phone.
* **Panic Key** is the key used to trigger the panic alarm (either silent or audible). By flipping this switch your alarm will go into panic mode (and your neighbors may be displeased).
* The **platformType** should be set to either "DSC", "Honeywell", or "Interlogix" (use Interlogix for GE/Caddx/NetworX panels) depending on the type of alarm panel
* Values for **DSCStay**, **DSCAway**, **DSCReset** and **DSCExit** are DSC specific
* Interlogix plugin does not support panic or chime buttons at this time

## Configuration of Alarmedecoder GUI (Honeywell/DSC Only)

* Go to your installation of the Alarmdecoder GUI
* Go to settings
* Notifications
* Create a new `custom` notification
* Select / Tick the following:
  * Alarm system is triggered
  * Alarm system stops signaling
  * A panic has been detected
  * A fire is detected
  * Alarm system is armed
  * Alarm system is disarmed
  * A zone has faulted
  * A zone has been restored
* Under 'custom settings'
* URL = the ip address of your homebridge
* Port = the port as specified above
* Method = Post

## Supporting Other Panels

* An [Abstract Base Class](./alarmsystems/base.js) is provided to guide development. All three functions must be overridden and appropriate logic added to the initPlatform function in index.js as to instantiate the right class for your panel (by using the PlatformType variable above).
* The system expect to receive a 'ping' (in the form of an HTTP GET) to the port specified in the config.json. That 'ping' informs the library to query the panel for a full status/zone report `getAlarmState`. This function should update the state variables of any zone and the system itself and return true/false depending on the success of the call.
* During startup, the system will call `initZones` to get a list of all zones. This will be compared with any cached zones and updated accordingly.
* The 'setAlarmState' function is called by the platform whenever the user requests a state change. It is expected that the plugin makes the call and returns true/false depending on success of the request. The platform will tell homekit that the target state has been successfully set and wait for the 'ping' to update the current state. if the next ping does not show an updated current state, the target state will be returned to the original value.

## License

Copyright 2018, [aficustree](https://github.com/aficustree)

Licensed under the Apache License, Version 2.0 (the "License"); you may not use this file except in compliance with the [License](./LICENSE).