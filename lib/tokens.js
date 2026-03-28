import crypto from 'crypto';

const generarToken = () => crypto.randomBytes(32).toString('hex') + "_DGc3_26_061108";

export { generarToken };