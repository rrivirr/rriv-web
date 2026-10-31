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
  isBootloaderReply,
  isValidUid,
  listCalibration,
  listSensors,
  parseCalibrationList,
  readBoardVersion,
  readBootloaderInfo,
  readDevice,
  readStartupReport,
  readTelemeter,
  removeAllSensors,
  removeSensor,
  setClock,
  setCommand,
  setDatalogger,
  setMode,
  setObject,
  serialSend,
  setSerialNumber,
  startApp,
  unappliedChanges,
  DATALOGGER_RESET,
  STARTUP_TRACE,
  deviceReset,
} from "./commands";
export type {
  BootloaderInfo,
  CalibrateSubcommand,
  CalibrationPair,
  DeviceInfo,
  SensorSummary,
  StartupReport,
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
export {
  BLOCK_SIZE,
  IMAGE_HEADER_SIZE,
  bootloaderTooOld,
  crc32,
  imageIntact,
  installFirmware,
  parseFirmwareImage,
} from "./firmware";
export type { FirmwareImage } from "./firmware";
export { buildDiagnostics, diagnosticsFilename } from "./diagnostics";
export type { Diagnostics } from "./diagnostics";
export { useSerialConnection } from "./useSerialConnection";
export type {
  ErrorEntry,
  FirmwareProgress,
  PortOption,
  RestartNotice,
  SerialConnection,
  SerialStatus,
  StartWatchOptions,
  TranscriptEntry,
} from "./useSerialConnection";
