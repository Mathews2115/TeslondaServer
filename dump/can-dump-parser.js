let current_kw = 0,
current_amps = 0,
current_volts = 0,
current_speed = 0,
current_ftlb = 0,
highest_kw = 0,
highest_amp = 0,
highest_volts = 0,
lowest_volts = 9999,
highest_speed = 0,
highest_ftlb = 0,
kwReport = {},
ampReport = {},
ftlbReport = {},
speedReport = {};
voltReport = {},
lowVoltReport = {}

// Make sure we got a filename on the command line.
if (process.argv.length < 3) {
  console.log('Usage: node ' + process.argv[1] + ' FILENAME');
  process.exit(1);
}

// Read the file and print its contents.
let fs = require('fs')
  , filename = process.argv[2];

fs.readFile(filename, 'utf8', (err, data) => {
  if (err) throw err;
  console.log('OK: ' + filename);
  console.log(data.split('\n').length);

  let parsedLog = [];

  const stringArray = data.split('\n')
  for (let line of stringArray) {
    if (line) {
      const token = line.split(/[ ,]+/);

      let ts = getTS(token[0]);
      let dataArray = getData(token[2], ts);

      if (dataArray) parsedLog.push(`${ts},${dataArray.join(',')}`)
    }
  }

  parsedLog.push("\n\n----------------- REPORT -----------------------");
  parsedLog.push(`\n${highestToString(kwReport)}`);
  parsedLog.push(`\n${highestToString(ampReport)}`);
  parsedLog.push(`\n${highestToString(ftlbReport)}`);
  parsedLog.push(`\n${highestToString(speedReport)}`);
  parsedLog.push(`\n${highestToString(voltReport)}`);
  parsedLog.push(`\n${highestToString(lowVoltReport)}`);
  // console.log(parsedLog.join('\n'));

  fs.writeFile('temp.txt', parsedLog.join("\n"), function(err, data){
    if (err) console.log(err);
    console.log("Successfully Written to File.");
  });

});


// exp: (1522126024.428975)
function getTS(tsString) {
  return parseFloat(tsString.replace(/[()]/g, ''));
}

const DI_TEMPERATURE = 0x506,
DI_TEMPERATURE2 = 0x514,
DI_MAX_T = 0x516,
SPEED_DATA = 0x115,
TORQUE_POWER_DATA = 0x116,
GENERAL_STATES = 0x117,
HVLV_DATA = 0x119,
POWER_DATA = 0x120,
POWER_DATA2 = 0x121,
TORQUE_LIMITS = 0x122,
SPEED_LIMIT = 0x123,
PEDAL_POS = 0x125

function setHighest(ts, title) {
  return {
    ts: ts,
    title: title,
    kW: current_kw,
    volt: current_volts,
    amps: current_amps,
    torque: current_ftlb,
    mph: current_speed
  }
}

function highestToString(obj) {
  return `${obj.title}\nts: ${obj.ts}, kW: ${obj.kW}, volt:${obj.volt}, amps: ${obj.amps}, FT-LB: ${obj.torque}, MPH: ${obj.mph} `;
}

// 116#00000000
function getData(dataString, timestamp) {
  const data = dataString.split('#');  // 0=Can id / [1]=data
  let canData = Buffer.from(data[1], 'hex');
  switch (parseInt(data[0], 16)) {
    case SPEED_DATA: {
      current_speed = Math.round((canData.readInt16BE(0) * 28.8) / 3269.28);
      if (current_speed > highest_speed) {
        highest_speed = current_speed;
        speedReport = setHighest(timestamp, 'Highest MPH');
      }
      return ['MPH:', current_speed]
      break;
   }
   case TORQUE_POWER_DATA: {
    //  ÷return Math.round((this.data.getInt16(TORQUE_POWER_DATA_OFFSETS.OUTPUT_TORQUE, this.littleEndian) / this.offset) * NM_FTLB_CONV);
      current_ftlb = Math.round(canData.readInt16BE(0) / 4 * 0.73756) ;
      current_kw = Math.round(canData.readInt16BE(2) / 4);
      if (current_ftlb > highest_ftlb) {
        highest_ftlb = current_ftlb;
        ftlbReport = setHighest(timestamp, 'Highest Torque FT-LB');
      }
      if (current_kw > highest_kw) {
        highest_kw = current_kw;
        kwReport = setHighest(timestamp, 'Highest kW');
      }
      return ['kW:', current_kw, 'FT-LB:', current_ftlb]
      break;
   }
   case HVLV_DATA: {
      current_amps = Math.round(canData.readInt16BE(2) / 8);
      current_volts = Math.round(canData.readInt16BE(0) / 8);

      if (current_amps > highest_amp) {
        highest_amp = current_amps;
        ampReport = setHighest(timestamp, 'Highest AMP');
      }

      if (current_volts > highest_volts){
        highest_volts = current_volts;
        voltReport = setHighest(timestamp, 'Highest Volts');
      }

      if (current_volts < lowest_volts) {
        lowest_volts = current_volts;
        lowVoltReport = setHighest(timestamp, 'Lowest Volts');
      }
      return ['amps:',  current_amps, 'volts:', current_volts]
      break;
   }
   case PEDAL_POS: {
      return ['Pedal:', `${Math.round(canData.readUInt8() * 0.4)}, ${canData.readUInt8(1) * 0.4}, ${canData.readUInt8(2)}` ]
      break;
   }
   default: {
      return null
      break;
   }
  }
}
