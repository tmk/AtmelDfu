/*
 *  Atmel DFU WebUSB
 */
// AVR MEGA: https://ww1.microchip.com/downloads/en/DeviceDoc/doc7618.pdf
// AVR XMEGA: https://ww1.microchip.com/downloads/en/devicedoc/doc8457.pdf

// bRequest
// DFU_DETACH, DFU_GETSTATE, DFU_ABORT is not defined on XMEGA and not used in dfu-programmer
export const bRequest = {
    DFU_DETACH: 0,
    DFU_DNLOAD: 1,
    DFU_UPLOAD: 2,
    DFU_GETSTATUS: 3,
    DFU_CLRSTATUS: 4,
    DFU_GETSTATE: 5,
    DFU_ABORT: 6,
};

// bStatus
export const bStatus = {
    OK: 0,
    errTARGET: 1,
    errFILE: 2,
    errWRITE: 3,
    errERASE: 4,
    errCHECK_ERASED: 5,
    errPROG: 6,
    errVERIFY: 7,
    errADDRESS: 8,
    errNOTDONE: 9,
    errFIRMWARE: 10,
    errVENDOR: 11,
    errUSBR: 12,
    errPOR: 13,
    errUNKNOWN: 14,
    errSTALLEDPK: 15,
};

// bState
export const bState = {
    appIDLE: 0,
    appDETACH: 1,
    dfuIDLE: 2,
    dfuDNLOAD_SYNC: 3,
    dfuDNBUSY: 4,
    dfuDNLOAD_IDLE: 5,
    dfuMANIFEST_SYNC: 6,
    dfuMANIFEST: 7,
    dfuMANIFEST_WAIT_RESET: 8,
    dfuUPLOAD_IDLE: 9,
    dfuERROR: 10,
};

export async function getAtmelDevice() {
    let dev = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x03eb /* atmel */ }] });
    await dev.open();
    await dev.claimInterface(0);
    return dev;
}

export function parseStatus(data) {
    return {
        bStatus:        data.getUint8(0),
        bwPollTimeOut:  data.getUint8(1)
                        | data.getUint8(2) << 8
                        | data.getUint8(3) << 16,
        bState:         data.getUint8(4),
        iString:        data.getUint8(5),
    };
}

export function getStatus(dev) {
    /* USBInTransferResult
     *    .data: GETSTATUS response(DataView)
     *              [0]:    bStatus
     *              [1..3]: bwPollTimeOut
     *              [4]:    bState
     *              [5]:    iString
     *    .status: 'ok', 'stall', or 'babble'
     */
    return dev.controlTransferIn(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_GETSTATUS,
            value:          0,
            index:          0,  // interface
        },
        6 /* length */
    );
};

export function writeBlock(dev, start, end, data, eeprom = false) {
    //let header = new Uint8Array(32);    // bMaxPacketSize0
    const header = [];
    header[0] = 0x01;   // 4.6.1.1 Write Command
    header[1] = (eeprom ? 0x01 : 0x00); // Flash:0  EEPROM:1
    header[2] = (start >> 8) & 0xff;
    header[3] = start & 0xff;
    header[4] = (end >> 8) & 0xff;
    header[5] = end & 0xff;
    header[31] = 0x00;

    //const footer = new Uint8Array(16);
    const footer = [];
    footer[0] = 0x00;   // CRC
    footer[1] = 0x00;
    footer[2] = 0x00;
    footer[3] = 0x00;
    footer[4] = 0x10;   // length of suffix
    footer[5] = 0x44;   // 'D'
    footer[6] = 0x46;   // 'F'
    footer[7] = 0x55;   // 'U'
    footer[8] = 0x01;   // bcdDFU
    footer[9] = 0x00;
    footer[10] = 0xff;  // idVendor
    footer[11] = 0xff;
    footer[12] = 0xff;  // idProduct
    footer[13] = 0xff;
    footer[14] = 0xff;  // bcdDevice
    footer[15] = 0xff;

    //let msg = header.concat(footer);
    let msg = new Uint8Array(header.length + data.length + footer.length);
    msg.set(header, 0);
    msg.set(data, header.length);
    msg.set(footer, header.length + data.length);
    console.log('length: ' + msg.length);
    console.log('msg: ' + msg);

    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        msg
    );
}

export async function readBlock(dev, start, end, eeprom = false) {
    if (dev === null) {
        return;
    }
    let cmd = new Uint8Array([ 0x03, 0x00, 0x00, 0x00, 0x00, 0x00 ]);
    cmd[1] = (eeprom ? 0x02 : 0x00);
    cmd[2] = (start >> 8) & 0xff;
    cmd[3] = start & 0xff;
    cmd[4] = (end >> 8) & 0xff;
    cmd[5] = end & 0xff;

    let result = await dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        cmd
    );
    console.log('byteWritten: ' + result.bytesWritten);

    return dev.controlTransferIn(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_UPLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        (end - start + 1)
    );
};

export function chipErase(dev) {
    const cmd = new Uint8Array([ 0x04, 0x00, 0xff ]);
    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        cmd
    );
}

export function blankCheck(dev, start, end) {
    const cmd = new Uint8Array([ 0x03, 0x01, 0x00, 0x00, 0x6f, 0xff ]);
    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        cmd
    );
}

export async function launch(dev) {
    const cmd = new Uint8Array([ 0x04, 0x03, 0x00 ]);
    await dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        cmd
    );
    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        }
    );
}

export function clearStatus(dev) {
    if (dev === null) {
        throw new Error('No device available');;
    }

    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_CLRSTATUS,
            value:          0,
            index:          0,  // interface
        },
    );
};

export function abort(dev) {
    if (dev === null) {
        return;
    }

    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        bRequest.DFU_ABORT,
            value:          0,
            index:          0,  // interface
        },
    );
}

