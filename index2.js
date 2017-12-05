import { access } from 'fs';

const Accessory, Service, Characteristic, UUIDGen;
const axios = require('axios'); 

module.exports = function(homebridge){
    Accessory = homebridge.platformAccessory;
	Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
	homebridge.registerPlatform("homebridge-alarmdecoder-platform", "alarmdecoder-platform", AlarmdecoderPlatform, true);
};

class AlarmDecoderZone {
    constructor (zoneID, name, description, accessory) {
        this.zoneID = zoneID;
        this.name = name;
        this.description = description;
        this.accessory = accessory;
        this.faulted = false;
    }
}

class AlarmDecoderSystem {
    constructor (accessory) {
        this.accessory = accessory;
    }
}

class AlarmdecoderPlatform {
    constructor (log, config, api) {
        this.log = log;
        if(api) {
            this.api = api;
            this.api.on('didFinishLaunching', ()=>{
                platform.log("Cached Accessories Loaded");
                this.initPlatform;
              });
        }
        this.port = config.port;
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;

        this.securityAccessory = null;
        this.zoneAccessories = [];

        this.alarmDecoderZones = [];
    }

    // homebridge will restore cached accessories
    configureAccessory(accessory){
        this.log(accessory.displayName, "Configuring Accessory from Cache");
        accessory.reachable = false; // will turn to true after validated
        this.addAccesory(accessory, false);
    }

    // if cached, no publish, otherwise set publish to true
    addAccessory(accessory, publish) {
        let securityAccessory = false;
        accessory.on('identify', (paired, callback) => {
            this.log(accessory.displayName, "Identify!!!");
            callback();
          });
        if(accessory.getService(Service.ContactSensor)) {
            accessory.getService(Service.ContactSensor)
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.zoneID,callback);
                });           
        }
        else if(accessory.getService(Service.MotionSensor)) {
            accessory.getService(Service.MotionSensor)
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.zoneID,callback);
                });
        }
        else if(accessory.getService(Service.SecuritySystem)) {
            securityAccessory = true;
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemCurrentState)
                .on('get', ()=>this.getAlarmState);
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemTargetState)
                .on('get', ()=>this.getAlarmState)
                .on('set', ()=>this.setAlarmState);
        }
        if(accessory.getService(Service.AccessoryInformation)) {
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Name, accessory.displayName)
                .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc')
                .setCharacteristic(Characteristic.Model, 'alarmdecoder homebridge plugin');
        }
        if(securityAccessory)
            this.securityAccessory = accessory;
        else
            this.zoneAccessories.push(accessory);
        if (publish)
            this.api.registerPlatformAccessories("homebridge-alarmdecoder-platform", "alarmdecoder-platform", accessory);
        return accessory;
    }

    get _zones() {
        return [];
    }

    initPlatform() {
        for (let zone in this._zones) {
            let zoneToAdd = new AlarmDecoderZone(zone.zone_id,zone.name,zone,description);
            // check if zone exists in array of zoneAccessories, otherwise add
            // by creating a new zone, setting display name to zone_id+name
            // dont forget to create UUID
            // passing to addAccessory with publish flag set to yes
            // then add the accessory returned to the accessory
            // push into alarmDecoderZones array
            // set accessory reachable to true
        }
        // check if security system accessory exists, if not, create
    }

    listener() {

    }

    getZoneState(zoneID, callback) {

    }

    getAlarmState(callback) {

    }

    setAlarmState(callback) {

    }
}