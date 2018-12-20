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