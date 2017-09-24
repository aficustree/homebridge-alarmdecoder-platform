module.exports = function(homebridge){
	Service = homebridge.hap.Service;
	Characteristic = homebridge.hap.Characteristic;
	homebridge.registerAccessory("homebridge-alarmdecoder-sensor", "alarmdecoder-sensor", alarmdecoderSensorAccessory);
};

function alarmdecoderSensorAccessory(log, config) {

}

alarmdecoderSensorAccessory.prototype = {

};