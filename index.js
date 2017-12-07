var Accessory, Service, Characteristic, UUIDGen;
var axios = require('axios'); 

module.exports = function(homebridge){
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', AlarmdecoderPlatform, true);
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
        this.state = null;
    }
}

class AlarmdecoderPlatform {
    constructor (log, config, api) {
        this.log = log;
        if(api) {
            this.api = api;
            this.api.on('didFinishLaunching', ()=>{
                this.log('Cached Accessories Loaded');
                this.initPlatform();
                this.listener = require('http').createServer(()=>this.httpListener);
                this.listener.listen(this.port);
            });
        }
        this.port = config.port;
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;

        this.name = config.name;

        this.securityAccessory = null; //used to hold the security system accessory
        this.zoneAccessories = []; //used to hold all zone accessories
        this.alarmDecoderZones = []; //used to hold all AlarmDecoderZones, which reference a zone accessory
        this.alarmDecoderSystem = null;
    }

    // homebridge will restore cached accessories
    configureAccessory(accessory){
        this.log(accessory.displayName, 'Configuring Accessory from Cache');
        accessory.reachable = false; // will turn to true after validated
        this.addAccesory(accessory, false);
    }

    // if cached, no publish, otherwise set publish to true
    addAccessory(accessory, publish) {
        let securityAccessory = false;
        accessory.on('identify', (paired, callback) => {
            this.log(accessory.displayName, 'Identify!!!');
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
                //.on('get', ()=>this.getAlarmState)
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
            this.api.registerPlatformAccessories('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', accessory);
        return accessory;
    }

    get _zones() {
        return [];
    }

    initPlatform() {
        for (let zone in this._zones) {
            var zoneToAdd = new AlarmDecoderZone(zone.zone_id,zone.name,zone.description);
            var exists = false;
            // check if zone already exists, otherwise add
            for(let accessory in this.zoneAccessories) 
                if(accessory.zoneID == zone.zone_id) {
                    exists = true;
                    accessory.reachable=true;
                    zoneToAdd.accessory=accessory;
                    break;
                }
            if(!exists) {
                let uuid = UUIDGen.generate(zone.zone_id+zone.name);
                let newAccessory = new Accessory(zone.zone_id+zone.name, uuid);
                newAccessory.zoneID=zone.zone_id;
                let re = new RegExp('motion','i');
                if(re.exec(zone.zone_id))
                    newAccessory.addService(Service.MotionSensor, zone.zone_id+zone.name);
                else
                    newAccessory.addService(Service.ContactSensor, zone.zone_id+zone.name);
                newAccessory.reachable=true;
                this.addAccessory(newAccessory,true);
                zoneToAdd.accessory=newAccessory;
            }
            this.alarmDecoderZones.push(zoneToAdd);
        }
        if(!this.securityAccessory) {
            let uuid = UUIDGen.generate(this.name);
            let newAccessory = new Accessory(this.name, uuid);
            newAccessory.addService(Service.SecuritySystem,this.name);
            newAccessory.reachable=true;
            this.addAccessory(newAccessory,true);
            this.SecurityAccessory = newAccessory;
            this.alarmDecoderSystem = new AlarmDecoderSystem(this.SecurityAccessory);
        }
    }

    httpListener(req, res) {
        var data = '';
		
        if (req.method == 'POST') {
            req.on('data', (chunk) => {
                data += chunk;
            });		
            req.on('end', () => {
                this.log('Received notification and body data:');
                this.log(data.toString());
            });
        }	
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end();
        this.log('Getting current state since ping received');
        this.getState(true);
    }

    async getState(report=false) {
        try {
            var response = await axios.get(this.stateURL);
            if (response) {
                let stateObj = JSON.parse(response);
                this.log(stateObj);
                if(stateObj.lastmessage && (stateObj.lastmessage.includes('NIGHT') || stateObj.lastmessage.includes('INSTANT')))
                    stateObj.panel_armed_night = true;
                /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
                if(stateObj.panel_alarming || stateObj.panel_panicked)
                    this.alarmDecoderSystem.state = 4;
                else if(stateObj.panel_armed_stay)
                    this.alarmDecoderSystem.state = 0;
                else if(stateObj.panel_armed_night)
                    this.alarmDecoderSystem.state = 2;
                else if(stateObj.panel_armed)
                    this.alarmDecoderSystem.state = 1;
                else
                    this.alarmDecoderSystem.state = 3;
                if(report)
                    this.alarmDecoderSystem.accessory.getService(Service.SecuritySystem)
                        .setCharacteristic(Characteristic.SecuritySystemCurrentState, this.alarmDecoderSystem.state);
                // set alarm state
                for(let alarmZone in this.alarmDecoderZones) {
                    if(stateObj.panel_zones_faulted[alarmZone.zoneID])
                        alarmZone.faulted = true;
                    else
                        alarmZone.faulted = false;
                    if(report) {
                        if(alarmZone.accessory.getService(Service.MotionSensor)) {
                            alarmZone.accessory.getService(Service.MotionSensor)
                                .setCharacteristic(Characteristic.MotionDetected, alarmZone.faulted);
                        }
                        else if(alarmZone.accessory.getService(Service.ContactSensor)) {
                            if(alarmZone.faulted)
                                alarmZone.accessory.getService(Service.ContactSensor)
                                    .setCharacteristic(Characteristic.ContactSensorState, 1);
                            else
                                alarmZone.accessory.getService(Service.ContactSensor)
                                    .setCharacteristic(Characteristic.ContactSensorState, 0);
                        }
                    }
                }
            }
        }
        catch (e) {
            this.log(e);
        }

    }

    getZoneState(zoneID, callback) {
        this.getState(false);
        for(let alarmZone in this.alarmDecoderZones) {
            if(alarmZone.zoneID==zoneID) {
                if(alarmZone.accessory.getService(Service.MotionSensor))
                    callback(null, alarmZone.faulted);
                else { //otherwise contact center
                    if(alarmZone.faulted)
                        callback(null,1);
                    else   
                        callback(null,0);
                }
            }
            else
                callback('no zone found',null);
            break;
        }
    }

    getAlarmState(callback) {
        this.getState(false);
        if(this.alarmDecoderSystem.state)
            callback(null,this.alarmDecoderSystem.state);
        else
            callback('state is null',null);
    }

    async setAlarmState(state, callback) {
        var codeToSend = null;
        switch (state) {
        case Characteristic.SecuritySystemTargetState.STAY_ARM:
            codeToSend = this.setPIN+'3';
            break;
        case Characteristic.SecuritySystemTargetState.AWAY_ARM :
            codeToSend = this.setPIN+'2';
            break;
        case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
            codeToSend = this.setPIN+'33';
            break;
        case Characteristic.SecuritySystemTargetState.DISARM:
            codeToSend = this.setPIN+'1';
            break;
        }
        var tempObj = new Object();
        tempObj.keys=codeToSend;
        var body = JSON.stringify(tempObj);
        var response = await axios.post(this.setURL,body);
        if(response.status==200)
            callback(null, response, state);
        else
            callback('state set failed', null, null);
    }
}