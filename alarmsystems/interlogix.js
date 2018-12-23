var alarms = require('./base.js');
var axios = require('axios');

class Interlogix extends alarms.AlarmBase {
    constructor (log, config) {
        super(log);
        this.axiosConfig = {headers:{
            'Content-Type':'application/json',
            'Accept':'application/json'
        }};
        this.stateURL = config.stateURL;
        this.zoneURL = config.zoneURL;
        this.setURL = config.setURL;
        this.setPIN = config.setPIN;
    }

    async getAlarmState() {
        var response = null;
        try {
            // query zone status
            response = await axios.get(this.zoneURL,this.axiosConfig);
            if ((response.status==200 || response.status==204) && response.data && response.data.zone.length > 0) 
                response.data['zones'].foreach((element)=> {
                    this.alarmZones.find(v => v.zoneID === element.number).faulted = element.state;
                });
            else
                throw 'getAlarmState failed at zone query with response status of '+response.status+' and data of: '+response.data;

            // query partition status
            response = await axios.get(this.stateURL,this.axiosConfig);
            if ((response.status==200 || response.status==204) && response.data) {
                let mainPartition = response.data['partitions'][0];
                let stayArmed = mainPartition.condition_flags.includes('Entryguard (stay mode)');
                if (!(mainPartition.armed || mainPartition.condition_flags.includes('Instant')))
                    this.state = 3; //disarmed
                else { // either alarmed or armed
                    var alarmingConditions = ['Siren on', 'Steady siren on', 'Fire'];
                    if (alarmingConditions.some(element => mainPartition.condition_flags.includes(element)))
                        this.state = 4; //alarming
                    else if(stayArmed)
                        this.state = 0; //stay|home
                    else if(mainPartition.condition_flags.includes('Instant'))
                        this.state = 2; //night|instant
                    else
                        this.state = 1; //away | exiting
                }
            }
            else
                throw 'getAlarmState failed at partition query with response status of '+response.status;


            return true;
        }
        catch (e) {
            this.log(e);
            return false;
        }
    }

    /* 0 = stay, 1 = away, 2 = night, 3 = disarmed, 4 = alarm */
    async setAlarmState(state) {
        this.state = state; //clears linter error
        try {
            switch(state) {
            case 0: // stay | home
                this.axiosConfig.params = {'cmd':'arm','type':'stay'};
                break;
            case 1: // away | exit
                this.axiosConfig.params = {'cmd':'arm','type':'exit'};
                break;
            case 2: // night (use interlogix auto)
                this.axiosConfig.params = {'cmd':'arm','type':'auto'};
                break;
            case 3: // disarmed
                this.axiosConfig.params = {'cmd':'disarm','type':'stay','master_pin':this.setPIN};
                break;
            case 4: // alarming | panic
                throw 'panic button not supported';
            case 'chime':
                throw 'chime button not supported';
            }
            var response = await axios.get(this.setURL,this.axiosConfig);
            if(response.status==200 || response.status==204) //should be a 204
                return true;
            else
                throw 'setAlarmState failed with response status of '+response.status;
        } catch(e) {
            this.log(e);
            return false;
        }
    }

    async initZones() {
        try {
            var response = await axios.get(this.zoneURL,this.axiosConfig);
            //for (let zone in response.data['zones']) {
            //    zone = response.data['zones'][zone];
            //    this.alarmZones.push(new alarms.AlarmZone(zone.number,zone.name,JSON.stringify(zone.type_flags)));
            //}
            if ((response.status==200 || response.status==204) && response.data && response.data.zones.length > 0) 
                response.data['zones'].foreach(element => 
                    this.alarmZones.push(new alarms.AlarmZone(element.number, element.name,JSON.stringify(element.type_flags)))
                );
            else
                throw 'initZones failed or generated null data with response status of '+response.status+' with data of '+response.data;    
            return true;
        }
        catch(e) {
            this.log(e);
            return false;
        }
    }
}

module.exports.Interlogix = Interlogix;