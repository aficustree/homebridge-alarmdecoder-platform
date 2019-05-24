var Accessory, Service, Characteristic, UUIDGen;
var axios = require('axios'); 
var debug = require('debug');

module.exports = function(homebridge){
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', AlarmdecoderPlatform, false);
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
        this.port = config.port;
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
        this.panicKey = config.panicKey;
        this.chimeKey = config.chimeKey;
        this.platformType = config.DSCorHoneywell;
        let rePlatformType = new RegExp('dsc','i');
        if(rePlatformType.exec(this.platformType)) {
            this.isDSC = true;
            this.DSCAway = config.DSCAway;
            this.DSCStay = config.DSCStay;
            this.DSCReset = config.DSCReset;
            this.DSCExit = config.DSCExit;
        }
        this.name = config.name;
        this.securityAccessory = null; //used to hold the security system accessory
        this.zoneAccessories = []; //used to hold all zone accessories
        this.switchAccessories = []; //used to hold the state dummy switches
        this.alarmDecoderZones = []; //used to hold all AlarmDecoderZones, which reference a zone accessory
        this.alarmDecoderSystem = null; //holds the object that includes the securityaccessory
        this.axiosHeaderConfig = {headers:{
            'Authorization':this.key,
            'Content-Type':'application/json',
            'Accept':'application/json'
        }};
        this.createSwitch = config.useSwitches;

        if(api) {
            this.api = api;
            this.api.on('didFinishLaunching', ()=>{
                this.log('Cached Accessories Loaded');
                this.initPlatform();
                this.listener = require('http').createServer((req, res)=>this.httpListener(req, res));
                this.listener.listen(this.port);
                this.log('listening on port ' + this.port);
                this.poller = setInterval(() => this.getState(true), 1000);
            });
        }
    }

    // homebridge will restore cached accessories
    configureAccessory(accessory){
        this.log(accessory.displayName, 'Configuring Accessory from Cache');
        accessory.reachable = false; // will turn to true after validated
        this.addAccessory(accessory, false);
    }

    // if cached, no publish, otherwise set publish to true
    addAccessory(accessory, publish) {
        this.log('adding accessory '+ accessory.displayName);
        accessory.on('identify', (paired, callback) => {
            this.log(accessory.displayName, 'Identify!!!');
            callback();
        });
        if(accessory.getService(Service.ContactSensor)) { 
            accessory.getService(Service.ContactSensor)
                .getCharacteristic(Characteristic.ContactSensorState)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.displayName,callback);
                });
            this.zoneAccessories.push(accessory); 
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder contact sensor');          
        }
        else if(accessory.getService(Service.MotionSensor)) {
            accessory.getService(Service.MotionSensor)
                .getCharacteristic(Characteristic.MotionDetected)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.displayName,callback);
                });
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder motion sensor');
        }
        else if(accessory.getService(Service.CarbonMonoxideSensor)) {
            accessory.getService(Service.CarbonMonoxideSensor)
                .getCharacteristic(Characteristic.CarbonMonoxideDetected)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.displayName,callback);
                });
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder carbon monoxide sensor');
        }
        else if(accessory.getService(Service.SmokeSensor)) {
            accessory.getService(Service.SmokeSensor)
                .getCharacteristic(Characteristic.SmokeDetected)
                .on('get', (callback)=>{
                    this.getZoneState(accessory.displayName,callback);
                });
            this.zoneAccessories.push(accessory);
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder smoke sensor');
        }
        else if(accessory.getService(Service.SecuritySystem)) {
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemCurrentState)
                .on('get', (callback)=>this.getAlarmState(callback));
            accessory.getService(Service.SecuritySystem)
                .getCharacteristic(Characteristic.SecuritySystemTargetState)
                .on('get', (callback)=>this.getAlarmState(callback))
                .on('set', (state,callback)=>{
                    this.setAlarmState(state,callback);
                    accessory.getService(Service.SecuritySystem)
                        .setCharacteristic(Characteristic.SecuritySystemCurrentState,
                            state);
                });
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder alarm system');
            this.securityAccessory = accessory;
        }
        else if(accessory.getService(Service.Switch)){
            accessory.getService(Service.Switch)
                .getCharacteristic(Characteristic.On)
                .on('get',(callback)=>this.getSwitchState(accessory.displayName, callback))
                .on('set',(state,callback)=>{
                    this.setSwitchState(state, accessory.displayName, callback);
                });
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder state switch');
            this.switchAccessories.push(accessory);
        }

        accessory.getService(Service.AccessoryInformation)
            .setCharacteristic(Characteristic.Name, accessory.displayName)
            .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc');

        if (publish) {
            this.log('publishing platform accessory '+accessory.displayName);
            this.api.registerPlatformAccessories('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', [accessory]);
        }
        return accessory;
    }

    async initPlatform() {
        this.log('initalizing platform');
        try {
            var response = await axios.get(this.zoneURL,this.axiosHeaderConfig);
            if (response.status!=200)
                throw 'platform did not respond';
            for (let zone in response.data['zones']) {
                zone = response.data['zones'][zone];
                var zoneToAdd = new AlarmDecoderZone(zone.zone_id,zone.name,zone.description);
                var exists = false;
                // check if zone already exists, otherwise add
                for(let accessory in this.zoneAccessories) {
                    accessory = this.zoneAccessories[accessory];
                    if(accessory.displayName == zone.zone_id+' '+zone.name) {
                        this.log('found '+accessory.displayName+' from cache, skipping');
                        exists = true;
                        accessory.reachable=true;
                        zoneToAdd.accessory=accessory;
                        break;
                    }
                }
                if(!exists) {
                    let uuid = UUIDGen.generate(zone.zone_id+' '+zone.name);
                    let newAccessory = new Accessory(zone.zone_id+' '+zone.name, uuid);
                    let reMotion = new RegExp('motion','i');
                    let reSmoke = new RegExp('smoke','i');
                    let reCarbon = new RegExp('carbon','i');
                    if(reMotion.exec(zone.zone_id+' '+zone.name))
                        newAccessory.addService(Service.MotionSensor, zone.zone_id+' '+zone.name);
                    else if(reSmoke.exec(zone.zone_id+' '+zone.name))
                        newAccessory.addService(Service.SmokeSensor, zone.zone_id+' '+zone.name);
                    else if(reCarbon.exec(zone.zone_id+' '+zone.name))
                        newAccessory.addService(Service.CarbonMonoxideSensor, zone.zone_id+' '+zone.name);
                    else
                        newAccessory.addService(Service.ContactSensor, zone.zone_id+' '+zone.name);
                    newAccessory.reachable=true;
                    this.addAccessory(newAccessory,true);
                    zoneToAdd.accessory=newAccessory;
                }
                this.alarmDecoderZones.push(zoneToAdd);
            }
            if(!this.securityAccessory) {
                this.log('adding security system accessory');
                let uuid = UUIDGen.generate(this.name);
                let newAccessory = new Accessory(this.name, uuid);
                newAccessory.addService(Service.SecuritySystem,this.name);
                newAccessory.reachable=true;
                this.addAccessory(newAccessory,true);
                this.securityAccessory = newAccessory;
            }
            else
                this.log('found security system from cache, skipping');
            
            
            // remove from create list any switches that are already cached
            for (let foundSwitch in this.switchAccessories) {
                this.log('found switch '+this.switchAccessories[foundSwitch].displayName+' from cache, skipping');
                this.createSwitch.splice(this.createSwitch.indexOf(this.switchAccessories[foundSwitch].displayName), 1);
            }

            for (let switchType in this.createSwitch) {
                this.log('adding switch accessory '+this.createSwitch[switchType]);
                let uuid = UUIDGen.generate(this.createSwitch[switchType]);
                let newAccessory = new Accessory(this.createSwitch[switchType], uuid);
                newAccessory.addService(Service.Switch,this.createSwitch[switchType]);
                newAccessory.reachable=true;
                this.addAccessory(newAccessory,true);
                this.switchAccessories.push(newAccessory);
            }
            
            this.securityAccessory.reachable=true;
            this.alarmDecoderSystem = new AlarmDecoderSystem(this.securityAccessory);
            this.getState(true);
        }
        catch (err) {
            this.log(err);
        }
    }

    httpListener(req, res) {
        var data = '';
		
        if (req.method == 'POST') {
            req.on('data', (chunk) => {
                data += chunk;
            });		
            req.on('end', () => {
                debug('Received notification and body data:');
                if(this.debug)
                    debug(data.toString());
            });
        }	
        res.writeHead(200, {'Content-Type': 'text/plain'});
        res.end();
        debug('Getting current state since ping received');
        this.getState(true);
    }

    async getState(report=false) {
        try {
            var response = await axios.get(this.stateURL,this.axiosHeaderConfig);
            if (response) {
                let stateObj = response.data;
                let switchToSet = null;
                if(stateObj.last_message_received && (stateObj.last_message_received.includes('NIGHT') || stateObj.last_message_received.includes('INSTANT')))
                    stateObj.panel_armed_night = true;
                /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
                this.log(JSON.stringify(stateObj));
                if(stateObj.panel_alarming || stateObj.panel_panicked || stateObj.panel_fire_detected) {
                    this.alarmDecoderSystem.state = 4;
                    switchToSet = 'panic';
                }
                else if(stateObj.panel_armed_night) {
                    this.alarmDecoderSystem.state = 2;
                    switchToSet = 'night';
                }
                else if(stateObj.panel_armed_stay) {
                    this.alarmDecoderSystem.state = 0;
                    switchToSet = 'stay';
                }
                else if(stateObj.panel_armed) {
                    this.alarmDecoderSystem.state = 1;
                    switchToSet = 'away';
                }
                else
                    this.alarmDecoderSystem.state = 3;
                if(report) {
                    this.alarmDecoderSystem.accessory.getService(Service.SecuritySystem)
                        .updateCharacteristic(Characteristic.SecuritySystemCurrentState, this.alarmDecoderSystem.state);
                    this.alarmDecoderSystem.accessory.getService(Service.SecuritySystem)
                        .updateCharacteristic(Characteristic.SecuritySystemTargetState, this.alarmDecoderSystem.state);      
                }
                
                // set switch states
                if(report)
                    for(let toggle in this.switchAccessories) 
                        if (this.switchAccessories[toggle].displayName == switchToSet)
                            this.switchAccessories[toggle].getService(Service.Switch)
                                .updateCharacteristic(Characteristic.On,true);
                        else
                            this.switchAccessories[toggle].getService(Service.Switch)
                                .updateCharacteristic(Characteristic.On,false);
            
                // set alarm state
                for(let alarmZone in this.alarmDecoderZones) {
                    alarmZone=this.alarmDecoderZones[alarmZone];
                    if(stateObj.panel_zones_faulted.indexOf(alarmZone.zoneID)!=-1)
                        alarmZone.faulted = true;
                    else
                        alarmZone.faulted = false;
                    if(report) {
                        if(alarmZone.accessory.getService(Service.MotionSensor)) {
                            alarmZone.accessory.getService(Service.MotionSensor)
                                .updateCharacteristic(Characteristic.MotionDetected, alarmZone.faulted);
                        }
                        else if(alarmZone.accessory.getService(Service.ContactSensor)) {
                            if(alarmZone.faulted)
                                alarmZone.accessory.getService(Service.ContactSensor)
                                    .updateCharacteristic(Characteristic.ContactSensorState, 1);
                            else
                                alarmZone.accessory.getService(Service.ContactSensor)
                                    .updateCharacteristic(Characteristic.ContactSensorState, 0);
                        }
                        else if(alarmZone.accessory.getService(Service.CarbonMonoxideSensor)) {
                            if(alarmZone.faulted)
                                alarmZone.accessory.getService(Service.CarbonMonoxideSensor)
                                    .updateCharacteristic(Characteristic.CarbonMonoxideDetected, 1);
                            else
                                alarmZone.accessory.getService(Service.CarbonMonoxideSensor)
                                    .updateCharacteristic(Characteristic.CarbonMonoxideDetected, 0);
                        }
                        else if(alarmZone.accessory.getService(Service.SmokeSensor)) {
                            if(alarmZone.faulted)
                                alarmZone.accessory.getService(Service.SmokeSensor)
                                    .updateCharacteristic(Characteristic.SmokeDetected, 1);
                            else
                                alarmZone.accessory.getService(Service.SmokeSensor)
                                    .updateCharacteristic(Characteristic.SmokeDetected, 0);
                        }
                    }
                }
            }
        }
        catch (e) {
            this.log(e);
        }

    }

    getZoneState(displayName, callback) {
        debug('getting state for '+displayName);
        this.getState(false); //don't publish state as it's being called from homekit and the callback will update instead
        var found = false;
        for(let alarmZone in this.alarmDecoderZones) {
            alarmZone=this.alarmDecoderZones[alarmZone];
            if((alarmZone.zoneID+' '+alarmZone.name)==displayName) {
                if(alarmZone.accessory.getService(Service.MotionSensor))
                    callback(null, alarmZone.faulted);
                else { //otherwise contact, smoke or carbon sensor which all use 1/0 in hap-nodejs instead of a bool
                    if(alarmZone.faulted)
                        callback(null,1);
                    else   
                        callback(null,0);
                }
                found = true;
                break;
            }
        }
        if(found==false) {
            debug('zone '+displayName+' not found');
            callback('no zone found',null);
        }
    }

    getAlarmState(callback) {
        debug('getting state for '+this.name);
        this.getState(false);
        if(this.alarmDecoderSystem.state!=null) {
            callback(null,this.alarmDecoderSystem.state);
        }
        else
            callback('state is null',null); //would only happen if call occurs and the alarmdecoder-UI is inaccessable, so basically it shouldn't
    }

    

    getSwitchState(switchType, callback) {
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        debug('getting state for switch '+ switchType);
        this.getState(false);
        if(switchType == 'panic' && this.alarmDecoderSystem.state==4)
            callback(null,true);
        else if (switchType == 'stay' && this.alarmDecoderSystem.state==0)
            callback(null,true);
        else if (switchType == 'away' && this.alarmDecoderSystem.state==1)
            callback(null,true);
        else if (switchType == 'night' && this.alarmDecoderSystem.state==2)
            callback(null,true);
        else
            callback(null,false);
    }

    async setSwitchState(state, switchType, callback) {
        this.log('setting switch '+switchType+' to '+state);
        if (!state) //switch is turnning off so disarm
            this.setAlarmState(Characteristic.SecuritySystemTargetState.DISARM, callback);
        else {
            if (switchType == 'panic')
                await this.setAlarmState(4, callback);
            else if (switchType == 'away')
                await this.setAlarmState(Characteristic.SecuritySystemTargetState.AWAY_ARM, callback);
            else if (switchType == 'night')
                await this.setAlarmState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, callback);
            else if (switchType == 'stay')
                await this.setAlarmState(Characteristic.SecuritySystemTargetState.STAY_ARM, callback);
            else if (switchType == 'chime')
                await this.setAlarmState('chime',callback);
            else   
                callback('invalid switch type',null);
        }
    }

    async setAlarmState(state, callback) {
        this.log('setting alarm state to '+state);
        var codeToSend = null;
        switch (state) {
        case Characteristic.SecuritySystemTargetState.STAY_ARM: //home
            codeToSend = this.isDSC ? this.DSCStay : this.setPIN+'3';
            break;
        case Characteristic.SecuritySystemTargetState.AWAY_ARM :
            codeToSend = this.isDSC ? this.DSCAway : this.setPIN+'2';
            break;
        case Characteristic.SecuritySystemTargetState.NIGHT_ARM:
            codeToSend = this.setPIN+'33';
            break;
        case Characteristic.SecuritySystemTargetState.DISARM:
            codeToSend = this.setPIN+'1';
            break;
        case 4:
            codeToSend= this.panicKey;
            state=true;
            break;
        case 'chime':
            codeToSend= this.setPIN+this.chimeKey;
            state=true;
            break;
        }
        var tempObj = new Object();
        tempObj.keys=codeToSend;
        var body = JSON.stringify(tempObj);
        debug(body);
        try {
            // ignore disarm requests if panel is already disarmed and it's a DSC panel (otherwise it rearms itself)
            if(this.isDSC && (state == Characteristic.SecuritySystemTargetState.DISARM) && (this.alarmDecoderSystem.state == 3))
                throw('disarm request for DSC panel but system is already disarmed, ignoring');
            var response = await axios.post(this.setURL,body,this.axiosHeaderConfig);
            if(response.status==200 || response.status==204) //should be a 204
                callback(null,state);
            else
                throw('set failed');
        }
        catch (err) {
            callback(err);
            this.log(err);
        }
    }
}