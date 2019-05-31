class AlarmZone {
    constructor (zoneID, name, description) {
        this.zoneID = zoneID;
        this.name = name;
        this.description = description;
        this.faulted = false;
    }
}

class AlarmBase {
    constructor (log) {
        this.state = null;
        this.log = log;
        this.alarmZones = []; //used to hold all AlarmDecoderZones, which reference a zone accessory
    }

    async getAlarmState() {
        throw 'must implement function updating alarm system state and state of all zones';
    }

    async setAlarmState(state) {
        this.state = state; //clears linter error
        throw 'must implement function updating alarm system state';
    }

    async initZones() {
        throw 'must implement functions to populate Zones with AlarmDecoderZone(s)';
    }
}

module.exports.AlarmZone = AlarmZone;
module.exports.AlarmBase = AlarmBase;