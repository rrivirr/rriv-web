export type { SerialTransport } from "./transport";
export { deviceNumber, isRawNumber, parseDeviceJson } from "./json";
export type { RawNumber } from "./json";
export { DEFAULT_BAUD_RATE, WebSerialTransport } from "./webSerialTransport";
export {
  SerialClient,
  SerialCrashError,
  SerialError,
  SerialTimeoutError,
  parseBoardStatus,
} from "./protocol";
export type { BoardStatus, SerialClientOptions, SerialRecord } from "./protocol";
export {
  MAX_SENSOR_ID_LENGTH,
  applyInitSettings,
  calibrate,
  calibrateCommand,
  changedProps,
  coerceValue,
  getCommand,
  getDatalogger,
  getObject,
  getSensor,
  isValidUid,
  listCalibration,
  listSensors,
  parseCalibrationList,
  readBoardVersion,
  readDevice,
  readTelemeter,
  removeAllSensors,
  removeSensor,
  serialSend,
  setClock,
  setCommand,
  setDatalogger,
  setMode,
  setObject,
  setSerialNumber,
  unappliedChanges,
} from "./commands";
export type {
  CalibrateSubcommand,
  CalibrationPair,
  DeviceInfo,
  SensorSummary,
  TelemeterInfo,
} from "./commands";
export {
  MAX_WATCH_FRAMES,
  downloadCsv,
  downloadText,
  frameToLogLine,
  framesToCsv,
  framesToLog,
  isFileSinkSupported,
  openFileSink,
  watchFilename,
} from "./watch";
export type { WatchFrame, WatchSink } from "./watch";
export {
  RRIV_USB_FILTER,
  describePort,
  forgetGrantedPorts,
  getWebSerial,
  isRrivPort,
  isWebSerialSupported,
} from "./webSerialApi";
export type {
  Serial,
  SerialPort,
  SerialPortInfo,
  SerialPortRequestOptions,
} from "./webSerialApi";
export { useSerialConnection } from "./useSerialConnection";
export type {
  PortOption,
  RestartNotice,
  SerialConnection,
  SerialStatus,
  StartWatchOptions,
  TranscriptEntry,
} from "./useSerialConnection";
