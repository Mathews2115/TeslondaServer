// CRUDE ADD DEV TEST DATA SERVER THING - I just copy and paste shit into here.
// by no means is this production ready, good lord no
const CAN_TABLE = 0x510;
const  DI_TEMPERATURE = 0x506;
const DI_TEMPERATURE2 = 0x514;
const DI_MAX_T = 0x516;
const SPEED_DATA = 0x115;
const TORQUE_POWER_DATA = 0x116;
const GENERAL_STATES = 0x117;
const CRUISE_STATE = 0x118;
const HVLV_DATA = 0x119;
const POWER_DATA = 0x120;
const POWER_DATA2 = 0x121;
const TORQUE_LIMITS = 0x122;
const SPEED_LIMIT = 0x123;
const IO_CONFIGS = 0x124;
const PEDAL_POS = 0x125;
const INPUT_ACK = 0x210;
// INPUT REQUESTS
const GEAR_REQUEST = 0x030;
const CRUISE_COMMAND = 0x218;
const SET_POWER_DATA = 0x220;
const SET_POWER_DATA2 = 0x221;
const OUTPUT_OVERRIDE = 0x231;
const SET_SPEED_LIMIT = 0x223;
const SET_TORQUE_LIMITS = 0x222;
const SET_IO_CONFIGS = 0x224;
const CONFIG_COMMAND = 0x2FF;

const inputVMax = 404;         // Input voltage (traction power)	240-404V DC (Limits configurable)
const inputVLogicMax = 16;     // Input voltage (logic)	10.5-16V DC
const inputALogicMax = 5;      // Input current (logic)	< 5A (max) (10A fuse suggested)
const inputCurrentMax = 1150;  // Input current (HV, peak)	1150A DC
const inputPowerMax = 400;        // Input power (peak)	400 kW (536 HP)
const p2w = '1.842 HP per lb'; // Power to weight (peak)
const rpmMax = 15200;          // Motor speed (max)	15,200 RPM
const torqueMax = 600;         // Torque (peak output)	600 Nm (~443 ft/lb)
const torqueRegenMax = 110;    // Torque (regenerative braking, peak)	110 Nm
const regenMax = 70;           // Output power (regenerative braking, peak)	70 kW
const regenAMax = 250;         // Output current (regenerative braking, peak)	250A
const inputPowerContinous = 35;// Input power (continuous)	35 kW (approximate)
const inputPower15min = 90;    // Input power (15 minute)	90 kW (approximate)

const HERTZ = []
HERTZ['100'] = 10;
HERTZ['10'] = 100;
HERTZ['1'] = 1000;

const ENDIAN_SETTING = false;
const expressServer = require('express'),
  server = require('http').createServer(expressServer()),
  can = require('socketcan');

let powerTimerId = null,
  speedTimerId = null,
  maxPowerTimerId = null,
  limitsId = null,
  generalStatesId = null,
  tempDataID = null,
  maxTempDataID = null,
  voltageDataID = null,
  sockets = new Set(),
  canChnl = can.createRawChannel(process.env.CHANNEL, true)
  maxRegenCurrent = 200,
  maxDischargeCurrent = 950,
  maxRegenPower = 50,
  maxDischargePower = 350;

const max_temp = 200;

canChnl.addListener("onMessage", function (msg) {
  switch (msg.id) {
    case SET_POWER_DATA:
      console.log(msg);
      break;
    case SET_TORQUE_LIMITS:
      console.log(msg);
      break;
  }
});

canChnl.start();

if (!powerTimerId){
  startTorqueTest();
}
if (!speedTimerId) {
  startSpeedTest()
}
if (!maxPowerTimerId) {
  startmaxPowerTest()
}
if (!generalStatesId) {
  startGeneralStatesTest();
}
if (!limitsId){
  startLimitsTest();
}
if (!tempDataID){
  startTempDataTest();
}
if (!maxTempDataID){
  startMaxTempData();
}
if (!voltageDataID) {
  startVoltTest();
}

function sendMsg(id, dataBuffer) {
  canChnl.send({
    id: id,
    ext: false,
    rtr: false,
    data: Buffer.from(dataBuffer)
  });
}

// HSR_torquePowerData
// ● Default CAN ID: 0x116
// ● Default frequency: 100 Hz
// ● Length: 4 bytes
function startTorqueTest() {
  const offset = 0.4;
  let storedPower = 0;
  let adjustValue = 1;
  let count = 0;
  // prepare data
  var buffer = new ArrayBuffer(4);
  var canData = new DataView(buffer);

  powerTimerId = setInterval(() => {
    canData.setUint16(0, (666*offset), ENDIAN_SETTING);  // torque
    canData.setUint16(2, (storedPower*offset), ENDIAN_SETTING); // voltage

    // send data
    sendMsg(0x116, buffer);

    // adjust value
    if (count <= 0) {
      storedPower = storedPower + adjustValue;
      if (storedPower >= inputPowerMax) {
        storedPower = inputPowerMax
        adjustValue = -1
      } else if (storedPower <= -regenMax) {
        storedPower = -regenMax
        adjustValue = 1
      }
      count = getRandomInt(1,5); // change value every half a second
    }
    count--;

  }, HERTZ['100']);
}

/** HSR_speedData
● Default CAN ID: 0x115
● Default frequency: 100 Hz
● Length: 6 bytes
● Data:
*/
function startSpeedTest() {
  let speed = 0;
  let maxPower = 95;
  let adj = 1;
  let count = HERTZ['100'];

  // prepare data
  var buffer = new ArrayBuffer(6);
  var canData = new DataView(buffer);


  speedTimerId = setInterval(() => {
    canData.setUint16(0, (speed), ENDIAN_SETTING);  // motorRPM
    canData.setUint16(2, (speed*10), ENDIAN_SETTING); // Calculated Vechicle Speed (MPH)
    canData.setUint16(4, (speed*10), ENDIAN_SETTING); // Tesla firmware provided Vehicle Speed (MPH)

    // send data
    sendMsg(0x115, buffer);
    if (count <= 0) {
      count = HERTZ['100'];
      adj = getAdj(0, maxPower, speed, 1, 2, adj);
      speed = Math.max(Math.min(speed + adj, maxPower), 0);
    }
    count--;
  }, HERTZ['100']);
}

/**
 * HSR_powerData
● Default CAN ID: 0x120
● Default frequency: 1 Hz
● Length: 8 bytes
 */
function startmaxPowerTest() {
      // prepare data
  var buffer = new ArrayBuffer(8);
  var canData = new DataView(buffer);

  canData.setUint16(0, (maxRegenCurrent*10), ENDIAN_SETTING);  /** Max HV charge/regen current (amps) */
  canData.setUint16(2, (maxDischargeCurrent*10), ENDIAN_SETTING); /** Max HV discharge current (amps) */
  canData.setUint16(4, (maxRegenPower*10), ENDIAN_SETTING); /** Max HV charge/regen power (kW) */
  canData.setUint16(6, (maxDischargePower*10), ENDIAN_SETTING); /** Max HV discharge power (kW) */

  maxPowerTimerId= setInterval(() => {
    sendMsg(0x120, buffer);
  }, HERTZ['1']);
}

/**
 * HSR_torqueLimits
● Default CAN ID: 0x122
● Default frequency: 10 Hz
● Length: 3 bytes
 */
function startLimitsTest() {
  const UPDATE = HERTZ['10'];
  let torqueLimit = 0;
  let regenLimit = 0;
  let tAdj = getAdj(0, 250, 100, 1, 5, 0);
  let lAdj = getAdj(0, 250, 100, 1, 5, 0);
  let count = 0;

  // prepare data
  var buffer = new ArrayBuffer(3);
  var canData = new DataView(buffer);

  limitsId = setInterval(() => {
    if (count == 0) {
      count = getRandomInt(1,10);
      // adjust value
      tAdj = getAdj(0, 250, torqueLimit, 1, 5, tAdj);
      lAdj = getAdj(0, 250, regenLimit, 1, 5, lAdj);
      torqueLimit = Math.max(Math.min(torqueLimit + tAdj, 250), 0);
      regenLimit = Math.max(Math.min(regenLimit + lAdj, 250), 0);

      // set data
      canData.setUint8(2, Math.random() >= 0.5); /**  HSR Crude Traction Control Enabled */
      canData.setUint8(0, regenLimit);  /** Regen Torque Percent */
      canData.setUint8(1, torqueLimit); /** Output Torque Percent */
    }
    count--;

    sendMsg(0x122, buffer);
  }, UPDATE);
}

/**
 * HSR_generalStates
● Default CAN ID: 0x117
● Default frequency: 100 Hz
● Length: 8 bytes
*/
function startGeneralStatesTest(){
  let time = 0;
  // prepare data
  var buffer = new ArrayBuffer(8);
  var canData = new DataView(buffer);

  generalStatesId= setInterval(() => {

    // ugly crude way of only updating once every so often
    // - keep actual sending at 10hz but visually only change stuff every second or so
    if (time === 0) {
      canData.setUint8(0,0);  // raw input
      canData.setUint8(1,0);  // raw output
      canData.setUint8(2, Math.random() >= 0.5);  // brake light
      canData.setUint8(3,0);  // rev light
      canData.setUint8(4,);  // reg brake over brake light threshold
      canData.setUint8(5,Math.random() >= 0.5);  // brake pedal pressed
      canData.setUint8(6,Math.random() >= 0.5);  // trq creep enabled
      canData.setUint8(7, getRandomInt(1,4));  // current accepted gear
      time = HERTZ['100'] * 10;
    }
    time--;

    sendMsg(0x117, buffer);
  }, HERTZ['100']);
}

/**
 * HSR_DI_temperature
● Default CAN ID: 0x506
● Default frequency: 1 Hz
● Length: 8 bytes
*/
function startTempDataTest() {
  let invertorTemp = 100;
  let statorTemp = 100;
  let inlet = 128;
  let staPct = 100;
  let invPct = 100;
  let tempAdj = 5;

  // prepare data
  var buffer = new ArrayBuffer(8);
  var canData = new DataView(buffer);

  tempDataID = setInterval(() => {
    canData.setUint8(0, 0);  // pcb
    canData.setUint8(1, Math.max(invertorTemp+40, 0));  // invertor
    canData.setUint8(2, Math.max(statorTemp+40, 0));  // stator
    canData.setUint8(3, 0);  // dccap
    canData.setUint8(4, 0);  // heatsink
    canData.setUint8(5, Math.max(inlet+40, 0));  // inlet
    canData.setUint8(6, Math.round(invPct / 0.4));  // inv pct
    canData.setUint8(7, Math.round(staPct / 0.4));  // stator pct

    // adjust value
    tempAdj = getAdj(0, max_temp, invertorTemp, 0.1, 2, tempAdj);

    // set values
    invertorTemp = Math.max(Math.min(invertorTemp + tempAdj, max_temp), 0);
    statorTemp = invertorTemp;
    inlet = invertorTemp;
    invPct = (invertorTemp / max_temp) * 100;
    staPct = invPct

    sendMsg(0x506, buffer);
  }, HERTZ['1']);
}

/**
 * HSR_DI_maxT
● Default CAN ID: 0x516
● Default frequency: 1 Hz
● Length: 5 bytes
 */
function startMaxTempData() {
  // prepare data
  var buffer = new ArrayBuffer(5);
  var canData = new DataView(buffer);
  var time = 1;

  canData.setUint8(1, max_temp+40);            // SG_DI_inverterTMax - Degrees in C
  canData.setUint8(2, max_temp+40);            // SG_DI_statorTMax - Degrees in C
  canData.setUint8(3, max_temp+40);            // SG_DI_dcCapTMax - Degrees in C
  canData.setUint8(4, max_temp+40);            // SG_DI_pcbTMax - Degrees in C

  maxTempDataID= setInterval(() => {
    if (time <= 0) {
      const newValue = Math.random() >= 0.5 ?  127 : 255;
      canData.setUint8(0, newValue);            // SG_DI_noFlowNeeded / inletPassiveTarget
      time = 5;
    }
    time--;

    sendMsg(0x516, buffer);
  }, HERTZ['1']);
}

/**
 * HSR_HVLVdata
● Default CAN ID: 0x119
● Default frequency: 100 Hz
● Length: 5 bytes
 */
function startVoltTest() {
  let hvVolt = {
    adj: 1,
    value: 400
  };
  let hvAmp = {
    adj: 4,
    value: 800
  };
  let hv12v = {
    adj: 0.1,
    value: 9
  };
  let time = 0;

  // prepare data
  var buffer = new ArrayBuffer(5);
  var canData = new DataView(buffer);

  voltageDataID = setInterval(() => {

    if (time === 0) {
      time = 10;
      // adjust value
      hvVolt = updateValue(0, inputVMax, hvVolt.value, hvVolt.adj);
      hvAmp = updateValue(-regenAMax, inputCurrentMax, hvAmp.value, hvAmp.adj);
      hv12v = updateValue(8, 16, hv12v.value, hv12v.adj);

      canData.setUint16(0, (hvVolt.value*8.0), ENDIAN_SETTING) // High voltage input voltage * 8.0 (Volts)
      canData.setInt16(2, (hvAmp.value*8.0), ENDIAN_SETTING)   // High voltage current estimate * 8.0 (Amps)
      canData.setUint8(4, (hv12v.value*8.0), ENDIAN_SETTING)   // 12V input voltage * 8.0 (Volts)
    }
    time--;

    sendMsg(0x119, buffer);
  }, HERTZ['100']);
}

/////////////////////////////////
function getRandomInt(min, max) {
  min = Math.ceil(min);
  max = Math.floor(max);
  return Math.floor(Math.random() * (max - min)) + min; //The maximum is exclusive and the minimum is inclusive
}

function getAdj(min, max, current, randomStart, randomEnd, adjustValue) {
  if (current >= max) {
    adjustValue = -getRandomInt(randomStart,randomEnd); // go backwards
  } else if (current <= min) {
    adjustValue = getRandomInt(randomStart,randomEnd);  // go forwards
  }
  return adjustValue;
}

function updateValue(min, max, current, adj) {
  current += adj;
  if (current > max) {
    current = max;
    adj = -adj; // go backwards
  } else if (current < min) {
    current = min;
    adj = -adj;  // go forwards
  }
  return {value: current, adj: adj};
}
