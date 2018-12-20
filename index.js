var Accessory, Service, Characteristic, UUIDGen;
var axios = require('axios'); 
var debug = require('debug');

module.exports = function(homebridge){
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', AlarmdecoderPlatform, true);
};

class AlarmDecoderZone {
    constructor (zoneID, name, description) {
        this.zoneID = zoneID;
        this.name = name;
        this.description = description;
        this.faulted = false;
    }
}

class AlarmDecoderSystem {
    constructor (log) {
        this.state = null;
        this.log = log;
        this.alarmDecoderZones = []; //used to hold all AlarmDecoderZones, which reference a zone accessory
    }

    getAlarmState() {
        throw 'must implement function updating alarm system state and state of all zones';
    }

    setAlarmState(state) {
        this.state = state; //clears linter error
        throw 'must implement function updating alarm system state';
    }

    initZones() {
        throw 'must implement functions to populate Zones with AlarmDecoderZone(s)';
    }
}

class HoneywellDSCAlarmDecoderSystem extends AlarmDecoderSystem {
    constructor (log, config) {
        super(log);
        this.key = config.key;
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
        this.panicKey = config.panicKey;
        this.chimeKey = config.chimeKey;
        let rePlatformType = new RegExp('dsc','i');
        if(rePlatformType.exec(this.platformType)) {
            this.isDSC = true;
            this.DSCAway = config.DSCAway;
            this.DSCStay = config.DSCStay;
            this.DSCReset = config.DSCReset;
            this.DSCExit = config.DSCExit;
        }
        this.axiosHeaderConfig = {headers:{
            'Authorization':this.key,
            'Content-Type':'application/json',
            'Accept':'application/json'
        }};
    }

    async initZones() {
        try {
            this.log('init zones');
            var response = await axios.get(this.zoneURL,this.axiosHeaderConfig);
            if (response.status!=200)
                throw 'platform did not respond';
            for (let zone in response.data['zones']) {
                zone = response.data['zones'][zone];
                this.alarmDecoderZones.push(new AlarmDecoderZone(zone.zone_id,zone.name,zone.description));
            }
            return true;
        }
        catch (e) {
            this.log(e);
            return false;
        }
    }

    async getAlarmState() {
        try {
            var response = await axios.get(this.stateURL,this.axiosHeaderConfig);
            if ((response.status==200 || response.status==204) && response.data) {
                let stateObj = response.data;
                if(stateObj.last_message_received && (stateObj.last_message_received.includes('NIGHT') || stateObj.last_message_received.includes('INSTANT')))
                    stateObj.panel_armed_night = true; //map instant mode to night

                /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
                this.log(JSON.stringify(stateObj));
                if(stateObj.panel_alarming || stateObj.panel_panicked || stateObj.panel_fire_detected) {
                    this.state = 4;
                }
                else if(stateObj.panel_armed_night) {
                    this.state = 2;
                }
                else if(stateObj.panel_armed_stay) {
                    this.state = 0;
                }
                else if(stateObj.panel_armed) {
                    this.state = 1;
                }
                else
                    this.state = 3;

                // use state object to update zones
                for(let alarmZone in this.alarmDecoderZones) {
                    alarmZone=this.alarmDecoderZones[alarmZone];
                    if(stateObj.panel_zones_faulted.indexOf(alarmZone.zoneID)!=-1)
                        alarmZone.faulted = true;
                    else
                        alarmZone.faulted = false;

                }
                return true;
            }
            else 
                throw 'null response received from alarmsystem query, is your controller up? status code '+response.status;
        }
        catch (e) {
            this.log(e);
            return false;
        }
    }

    async setAlarmState(state) {
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
        try {
            // ignore disarm requests if panel is already disarmed and it's a DSC panel (otherwise it rearms itself)
            if(this.isDSC && (state == Characteristic.SecuritySystemTargetState.DISARM) && (this.state == 3)) {
                debug('disarm request for DSC panel but system is already disarmed, ignoring');
                return true;
            }
            var response = await axios.post(this.setURL,body,this.axiosHeaderConfig);
            if(response.status==200 || response.status==204) //should be a 204
                return true;
            else
                throw 'got status code '+response.status;
        }
        catch (err) {
            this.log(err);
            return false;
        }
    }
}

class AlarmdecoderPlatform {
    constructor (log, config, api) {
        this.log = log;
        this.port = config.port;
        this.name = config.name;
        this.switchAccessories = []; //used to hold the state dummy switches
        this.alarmDecoderSystem = null; // set of the right class during initPlatform
        this.createSwitch = config.useSwitches;
        this.zoneAccessories = [];  // holds accessories pulled from cache before attachment
        config.DSCorHoneywell ? this.platformType = config.DSCorHoneywell : this.platformType = config.platformType;  // back compatibility
        
        // setting alarm class type
        let rePlatformType = new RegExp('dsc|honeywell','i');
        if(rePlatformType.exec(this.platformType)) 
            this.alarmDecoderSystem = new HoneywellDSCAlarmDecoderSystem(log, config);
        rePlatformType = new RegExp('interlogix|ge|caddx','i');
        if(rePlatformType.exec(this.platformType)) 
            this.alarmDecoderSystem = new AlarmDecoderSystem(log, config);
        if(!this.alarmDecoderSystem) {
            this.log('no system specified, assuming Honeywell, please add platformType variable to your config.json');
            this.alarmDecoderSystem = new HoneywellDSCAlarmDecoderSystem(log, config);
        }
        debug('platform class in use: '+this.alarmDecoderSystem.constructor.name);
        
        if(api) {
            this.api = api;
            this.api.on('didFinishLaunching', ()=>{
                this.log('Cached Accessories Loaded');
                this.initPlatform();
                this.listener = require('http').createServer((req, res)=>this.httpListener(req, res));
                this.listener.listen(this.port);
                this.log('listening on port '+this.port);
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
                    this.setAlarmtoState(state,callback);
                    accessory.getService(Service.SecuritySystem)
                        .setCharacteristic(Characteristic.SecuritySystemCurrentState,
                            state);
                });
            accessory.getService(Service.AccessoryInformation)
                .setCharacteristic(Characteristic.Model, 'alarmdecoder alarm system');
            this.alarmDecoderSystem.accessory = accessory;
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
            .setCharacteristic(Characteristic.Manufacturer, 'honeywell/dsc/interlogix');

        if (publish) {
            this.log('publishing platform accessory '+accessory.displayName);
            this.api.registerPlatformAccessories('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', [accessory]);
        }
        return accessory;
    }

    async initPlatform() {

        this.log('initalizing platform');

        // if security system wasn't pulled from cache, add
        if(!this.alarmDecoderSystem.accessory) {
            this.log('adding security system accessory');
            let uuid = UUIDGen.generate(this.name);
            let newAccessory = new Accessory(this.name, uuid);
            newAccessory.addService(Service.SecuritySystem,this.name);
            newAccessory.reachable=true;
            this.addAccessory(newAccessory,true);
        }
        else
            this.log('found security system from cache, skipping');

        // zone setup
        if(await this.alarmDecoderSystem.initZones()) {
            // go through each cache entry and match to zone
            for (let zone in this.zoneAccessories) {
                var cachedZone = this.zoneAccessories[zone];
                for(let adZone in this.alarmDecoderSystem.alarmDecoderZones) {
                    let tempZone = this.alarmDecoderSystem.alarmDecoderZones[adZone];
                    if (cachedZone.displayName == tempZone.zoneID+' '+tempZone.name) { // need to do name match logic, possibly consider UUID work
                        this.alarmDecoderSystem.alarmDecoderZones[adZone].accessory=cachedZone;
                        break;
                    }
                }
            }

            // go through each zone and if it's missing an accessory then add
            for(let zone in this.alarmDecoderSystem.alarmDecoderZones) {
                if(!this.alarmDecoderSystem.alarmDecoderZones[zone].accessory) { //not already loaded
                    let tempZone = this.alarmDecoderSystem.alarmDecoderZones[zone];
                    let uuid = UUIDGen.generate(tempZone.zoneID+' '+tempZone.name);
                    let newAccessory = new Accessory(tempZone.zoneID+' '+tempZone.name, uuid);
                    let reMotion = new RegExp('motion','i');
                    let reSmoke = new RegExp('smoke','i');
                    let reCarbon = new RegExp('carbon','i');
                    if(reMotion.exec(tempZone.zoneID+' '+tempZone.name))
                        newAccessory.addService(Service.MotionSensor, tempZone.zoneID+' '+tempZone.name);
                    else if(reSmoke.exec(zone.zoneID+' '+zone.name))
                        newAccessory.addService(Service.SmokeSensor, tempZone.zoneID+' '+tempZone.name);
                    else if(reCarbon.exec(tempZone.zoneID+' '+tempZone.name))
                        newAccessory.addService(Service.CarbonMonoxideSensor, tempZone.zoneID+' '+tempZone.name);
                    else
                        newAccessory.addService(Service.ContactSensor, tempZone.zoneID+' '+tempZone.name);
                    newAccessory.reachable=true;
                    this.log(newAccessory);
                    this.alarmDecoderSystem.alarmDecoderZones[zone].accessory=newAccessory;
                    this.addAccessory(newAccessory,true);
                }
                else
                    this.log('found '+this.alarmDecoderSystem.alarmDecoderZones[zone].accessory.displayName+',from cache, skipping');
            }
        }

        // remove from create list any switches that are already cached
        for (let foundSwitch in this.switchAccessories) {
            this.log('found switch '+this.switchAccessories[foundSwitch].displayName+' from cache, skipping');
            this.createSwitch.splice(this.createSwitch.indexOf(this.switchAccessories[foundSwitch].displayName), 1);
        }

        for (let switchType in this.createSwitch) {
            debug('adding switch accessory '+this.createSwitch[switchType]);
            let uuid = UUIDGen.generate(this.createSwitch[switchType]);
            let newAccessory = new Accessory(this.createSwitch[switchType], uuid);
            newAccessory.addService(Service.Switch,this.createSwitch[switchType]);
            newAccessory.reachable=true;
            this.addAccessory(newAccessory,true);
            this.switchAccessories.push(newAccessory);
        }

        this._getStateFromAlarm(true); //inital state seed
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
        this._getStateFromAlarm(true);
    }

    // private method used by registered functions to get state from Alarm
    async _getStateFromAlarm(report=false) {
        try {
            await this.alarmDecoderSystem.getAlarmState();
        }
        catch (e) {
            this.log(e);
            return false;
        }
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        if(report) {
            //update alarm
            this.alarmDecoderSystem.accessory.getService(Service.SecuritySystem)
                .updateCharacteristic(Characteristic.SecuritySystemCurrentState, this.alarmDecoderSystem.state);
            this.alarmDecoderSystem.accessory.getService(Service.SecuritySystem)
                .updateCharacteristic(Characteristic.SecuritySystemTargetState, this.alarmDecoderSystem.state);      

            //update switches
            var switchToSet=null;
            switch (this.alarmDecoderSystem.state) {
            case 0:
                switchToSet='stay';
                break;
            case 1:
                switchToSet='away';
                break;
            case 2:
                switchToSet='night';
                break;
            case 4:
                switchToSet='panic';
                break;
            default:
                break;
            }
            for(let toggle in this.switchAccessories) 
                if (this.switchAccessories[toggle].displayName == switchToSet)
                    this.switchAccessories[toggle].getService(Service.Switch)
                        .updateCharacteristic(Characteristic.On,true);
                else
                    this.switchAccessories[toggle].getService(Service.Switch)
                        .updateCharacteristic(Characteristic.On,false);
            
            // update zones
            for(let alarmZone in this.alarmDecoderSystem.alarmDecoderZones) {
                alarmZone=this.alarmDecoderSystem.alarmDecoderZones[alarmZone];
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

        return true;
    }

    async getZoneState(displayName, callback) {
        debug('getting state for '+displayName);
        await this._getStateFromAlarm(false); // avoid out-of-sync errors by getting the whole state tree but don't push, just wait on the callback to do it
        var found = false;
        for(let alarmZone in this.alarmDecoderSystem.alarmDecoderZones) {
            alarmZone=this.alarmDecoderSystem.alarmDecoderZones[alarmZone];
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

    async getAlarmState(callback) {
        debug('getting state for '+this.name);
        if(await this._getStateFromAlarm(false) && this.alarmDecoderSystem.state) 
            callback(null,this.alarmDecoderSystem.state);
        else
            callback('get state failed or null',null); 
    }

    async getSwitchState(switchType, callback) {
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        debug('getting state for switch '+ switchType);
        await this._getStateFromAlarm(false);
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
        debug('setting switch '+switchType+' to '+state);
        if (!state) //switch is turnning off so disarm
            await this.setAlarmtoState(Characteristic.SecuritySystemTargetState.DISARM, callback);
        else {
            if (switchType == 'panic')
                this.setAlarmtoState(4, callback);
            else if (switchType == 'away')
                this.setAlarmtoState(Characteristic.SecuritySystemTargetState.AWAY_ARM, callback);
            else if (switchType == 'night')
                this.setAlarmtoState(Characteristic.SecuritySystemTargetState.NIGHT_ARM, callback);
            else if (switchType == 'stay')
                this.setAlarmtoState(Characteristic.SecuritySystemTargetState.STAY_ARM, callback);
            else if (switchType == 'chime')
                this.setAlarmtoState('chime',callback);
            else   
                callback('invalid switch type',null);
        }
    }

    async setAlarmtoState(state, callback) {
        debug('setting alarm state to '+state);
        if(await this.alarmDecoderSystem.setAlarmState(state))
            callback(null,state);
        else
            callback('set failed',null);
    }
}