var Accessory, Service, Characteristic, UUIDGen;
var debug = require('debug')('alarmdecoder');
var alarms = require('./alarmsystems');

module.exports = function(homebridge){
    Accessory = homebridge.platformAccessory;
    Service = homebridge.hap.Service;
    Characteristic = homebridge.hap.Characteristic;
    UUIDGen = homebridge.hap.uuid;
    homebridge.registerPlatform('homebridge-alarmdecoder-platform', 'alarmdecoder-platform', AlarmdecoderPlatform, true);
};

class AlarmdecoderPlatform {
    constructor (log, config, api) {
        this.log = log;
        this.port = config.port;
        this.name = config.name;
        this.switchAccessories = []; //used to hold the state dummy switches
        this.alarmSystem = null; // set of the right class during initPlatform
        this.createSwitch = config.useSwitches;
        this.zoneAccessories = [];  // holds accessories pulled from cache before attachment
        config.DSCorHoneywell ? this.platformType = config.DSCorHoneywell : this.platformType = config.platformType;  // back compatibility
        
        // setting alarm class type
        let rePlatformType = new RegExp('dsc|honeywell','i');
        if(rePlatformType.exec(this.platformType)) 
            this.alarmSystem = new alarms.HoneywellDSC(log, config);
        rePlatformType = new RegExp('interlogix|ge|caddx','i');
        if(rePlatformType.exec(this.platformType)) 
            this.alarmSystem = new alarms.Interlogix(log, config);
        if(!this.alarmSystem) {
            this.log('no system specified, assuming Honeywell, please add platformType variable to your config.json');
            this.alarmSystem = new alarms.HoneywellDSC(log, config);
        }
        debug('platform class in use: '+this.alarmSystem.constructor.name);
        
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
        // accessory.on('identify', (paired, callback) => {
        accessory.on('identify', (callback) => { // fix #16
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
            this.alarmSystem.accessory = accessory;
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
        if(!this.alarmSystem.accessory) {
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
        if(await this.alarmSystem.initZones()) {
            // go through each cache entry and match to zone
            for (let zone in this.zoneAccessories) {
                var cachedZone = this.zoneAccessories[zone];
                for(let adZone in this.alarmSystem.alarmZones) {
                    let tempZone = this.alarmSystem.alarmZones[adZone];
                    if (cachedZone.displayName == tempZone.zoneID+' '+tempZone.name) { // need to do name match logic, possibly consider UUID work
                        this.alarmSystem.alarmZones[adZone].accessory=cachedZone;
                        break;
                    }
                }
            }

            // go through each zone and if it's missing an accessory then add
            for(let zone in this.alarmSystem.alarmZones) {
                if(!this.alarmSystem.alarmZones[zone].accessory) { //not already loaded
                    let tempZone = this.alarmSystem.alarmZones[zone];
                    let uuid = UUIDGen.generate(tempZone.zoneID+' '+tempZone.name);
                    let newAccessory = new Accessory(tempZone.zoneID+' '+tempZone.name, uuid);
                    let reMotion = new RegExp('motion','i');
                    let reSmoke = new RegExp('smoke','i');
                    let reCarbon = new RegExp('carbon','i');
                    if(reMotion.exec(tempZone.zoneID+' '+tempZone.name))
                        newAccessory.addService(Service.MotionSensor, tempZone.zoneID+' '+tempZone.name);
                    else if(reSmoke.exec(tempZone.zoneID+' '+tempZone.name))
                        newAccessory.addService(Service.SmokeSensor, tempZone.zoneID+' '+tempZone.name);
                    else if(reCarbon.exec(tempZone.zoneID+' '+tempZone.name))
                        newAccessory.addService(Service.CarbonMonoxideSensor, tempZone.zoneID+' '+tempZone.name);
                    else
                        newAccessory.addService(Service.ContactSensor, tempZone.zoneID+' '+tempZone.name);
                    newAccessory.reachable=true;
                    this.log(newAccessory);
                    this.alarmSystem.alarmZones[zone].accessory=newAccessory;
                    this.addAccessory(newAccessory,true);
                }
                else
                    this.log('found '+this.alarmSystem.alarmZones[zone].accessory.displayName+',from cache, skipping');
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
            await this.alarmSystem.getAlarmState();
        }
        catch (e) {
            this.log(e);
            return false;
        }
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        if(report) {
            //update alarm
            this.alarmSystem.accessory.getService(Service.SecuritySystem)
                .updateCharacteristic(Characteristic.SecuritySystemCurrentState, this.alarmSystem.state);
            this.alarmSystem.accessory.getService(Service.SecuritySystem)
                .updateCharacteristic(Characteristic.SecuritySystemTargetState, this.alarmSystem.state);      

            //update switches
            var switchToSet=null;
            switch (this.alarmSystem.state) {
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
            for(let alarmZone in this.alarmSystem.alarmZones) {
                alarmZone=this.alarmSystem.alarmZones[alarmZone];
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
        for(let alarmZone in this.alarmSystem.alarmZones) {
            alarmZone=this.alarmSystem.alarmZones[alarmZone];
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
        if(await this._getStateFromAlarm(false) && this.alarmSystem.state) 
            callback(null,this.alarmSystem.state);
        else
            callback('get state failed or null',null); 
    }

    async getSwitchState(switchType, callback) {
        /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
        debug('getting state for switch '+ switchType);
        await this._getStateFromAlarm(false);
        if(switchType == 'panic' && this.alarmSystem.state==4)
            callback(null,true);
        else if (switchType == 'stay' && this.alarmSystem.state==0)
        else if ((switchType == 'stay' || switchType == 'home') && this.alarmSystem.state==0)
            callback(null,true);
        else if (switchType == 'away' && this.alarmSystem.state==1)
            callback(null,true);
        else if (switchType == 'night' && this.alarmSystem.state==2)
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
        if(await this.alarmSystem.setAlarmState(state))
            callback(null,state);
        else
            callback('set failed',null);
    }
}
