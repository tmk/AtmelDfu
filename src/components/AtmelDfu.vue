<script setup>
import { ref } from 'vue'

defineProps({
  d: {
    type: String,
    required: true,
  },
})

/*
 *  Atmel DFU WebUSB
 */
// https://ww1.microchip.com/downloads/en/DeviceDoc/doc7618.pdf
const AtmelDFU = {
    // bRequest
    bRequest: {
        DFU_DETACH: 0,
        DFU_DNLOAD: 1,
        DFU_UPLOAD: 2,
        DFU_GETSTATUS: 3,
        DFU_CLRSTATUS: 4,
        DFU_GETSTATE: 5,
        DFU_ABORT: 6,
    },
    // bStatus
    bStatus: {
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
    },
    // bState
    bState: {
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
    },
};


let isButtonDisabled = false;

var target = null; // USBDevice

const device = ref('Not Selected');

async function selectDevice() {
    try {
        target = await navigator.usb.requestDevice({ filters: [{ vendorId: 0x03eb /* atmel */ }] });
        await target.open();
        await target.claimInterface(0);

        device.value = target.productName;
        console.log(target.productName);
        console.log(target.manufacturerName);
    } catch(e) {
        target = null;
        device.value = 'Not selected';
        console.log(e);
    }
}

const status = ref('');

function parseStatus(data) {
    return {
        bStatus:        data.getUint8(0),
        bwPollTimeOut:  data.getUint8(1)
                        | data.getUint8(2) << 8
                        | data.getUint8(3) << 16,
        bState:         data.getUint8(4),
        iString:        data.getUint8(5),
    };
}

async function checkStatus() {
    if (target === null) {
        status.value = 'no target';
        return;
    }
    try {
        let result = await getStatus(target);

        status.value = result.status;
        let stat = parseStatus(result.data);
        console.log('status: '        + result.status);
        console.log('bStatus: '       + stat.bStatus);
        console.log('bwPollTimeOut: ' + stat.bwPollTimeOut);
        console.log('bState: '        + stat.bState);
        console.log('iString: '       + stat.iString);
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    }
}

function getStatus(dev) {
    if (dev === null) {
        return;
    }
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
            request:        AtmelDFU.bRequest.DFU_GETSTATUS,
            value:          0,
            index:          0,  // interface
        },
        6 /* length */
    );
};

function clearStatus(dev) {
    if (dev === null) {
        throw new Error('No device available');;
    }

    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        AtmelDFU.bRequest.DFU_CLRSTATUS,
            value:          0,
            index:          0,  // interface
        },
    );
};

function abort(dev) {
    if (dev === null) {
        return;
    }

    return dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        AtmelDFU.bRequest.DFU_ABORT,
            value:          0,
            index:          0,  // interface
        },
    );
};

async function writeFlash() {
    try {
        let result = await writeBlock(target, 0x0000, 0x5, [0, 1, 2, 3, 4, 5]);
        console.log('byteWritten: ' + result.bytesWritten);
        console.log('status: ' + result.status);
        status.value = result.status;
    } catch (e) {
        console.log(e);
    }
}

function writeBlock(dev, start, end, data) {
    //let header = new Uint8Array(32);    // bMaxPacketSize0
    const header = [];
    header[0] = 0x01;   // 4.6.1.1 Write Command
    header[1] = 0x00;   // Flash:0  EEPROM:1
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
            request:        AtmelDFU.bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        msg
    );
}

async function readFlash() {
    try {
        let result = await readBlock(target, 0x0000, 0x6fff);
        console.log('status: '        + result.status);
        status.value = result.status;

        /*
        console.log(result.data.getUint8(0));
        console.log(result.data.getUint8(1));
        console.log(result.data.getUint8(2));
        console.log(result.data.getUint8(0x6fff));

        result = await getStatus(dev);
        let stat = parseStatus(result.data);
        console.log('status: '        + result.status);
        console.log('bStatus: '       + stat.bStatus);
        console.log('bwPollTimeOut: ' + stat.bwPollTimeOut);
        console.log('bState: '        + stat.bState);
        console.log('iString: '       + stat.iString);
        */
    } catch (e) {
        console.log(e);
    }
}

async function readBlock(dev, start, end) {
    if (dev === null) {
        return;
    }
    let cmd = new Uint8Array([ 0x03, 0x00, 0x00, 0x00, 0x00, 0x00 ]);
    cmd[2] = (start >> 8) & 0xff;
    cmd[3] = start & 0xff;
    cmd[4] = (end >> 8) & 0xff;
    cmd[5] = end & 0xff;

    let result = await dev.controlTransferOut(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        AtmelDFU.bRequest.DFU_DNLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        cmd
    );
    console.log('byteWritten: ' + result.bytesWritten);

    result = await dev.controlTransferIn(
        {
            requestType:    'class',
            recipient:      'interface',
            request:        AtmelDFU.bRequest.DFU_UPLOAD,
            value:          0,  // wBlock
            index:          0,  // interface
        },
        (end - start + 1)
    );
    for (let i = 0; i < result.data.byteLength; i++) {
        if (result.data.getUint8(i) !== 0xff) {
            console.log(i.toString(16) + ': '  + result.data.getUint8(i).toString(16));
        }
    }
    console.log('byteLength: ' + result.data.byteLength);

    return result;
};

async function eraseAll() {
    if (target === null) {
        status.value = 'no target';
        return;
    }
    try {
        const cmd = new Uint8Array([ 0x04, 0x00, 0xff ]);
        let result = await target.controlTransferOut(
            {
                requestType:    'class',
                recipient:      'interface',
                request:        AtmelDFU.bRequest.DFU_DNLOAD,
                value:          0,  // wBlock
                index:          0,  // interface
            },
            cmd);
        console.log('byteWritten: ' + result.bytesWritten);
        status.value = result.status;   // 'ok' or 'stall'
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    }
}

async function blankCheck() {
    if (target === null) {
        status.value = 'no target';
        return;
    }
    try {
        // TODO:
        // atmeaga32u2/u4
        //      App: 28KB  0x0000 ... 0x6fff
        //      Flash: 32KB, Bootloader: 4KB
        const cmd = new Uint8Array([ 0x03, 0x01, 0x00, 0x00, 0x6f, 0xff ]);
        let result = await target.controlTransferOut(
            {
                requestType:    'class',
                recipient:      'interface',
                request:        AtmelDFU.bRequest.DFU_DNLOAD,
                value:          0,  // wBlock
                index:          0,  // interface
            },
            cmd);
        console.log('byteWritten: ' + result.bytesWritten);

        result = await getStatus(target);
        let stat = parseStatus(result.data);
        console.log('status: '        + result.status);
        console.log('bStatus: '       + stat.bStatus);
        console.log('bwPollTimeOut: ' + stat.bwPollTimeOut);
        console.log('bState: '        + stat.bState);
        console.log('iString: '       + stat.iString);

        if (stat.bStatus == AtmelDFU.bStatus.OK) {
            console.log('Blank');
        } else if (stat.bStatus === AtmelDFU.bStatus.errCHECK_ERASED) {
            console.log('Not Blank');
        }

        status.value = result.status;
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    }
}

async function launch() {
    if (target === null) {
        status.value = 'no target';
        return;
    }
    try {
        const cmd = new Uint8Array([ 0x04, 0x03, 0x00 ]);
        let result = await target.controlTransferOut(
            {
                requestType:    'class',
                recipient:      'interface',
                request:        AtmelDFU.bRequest.DFU_DNLOAD,
                value:          0,  // wBlock
                index:          0,  // interface
            },
            cmd);
        console.log('byteWritten1: ' + result.bytesWritten);

        result = await target.controlTransferOut(
            {
                requestType:    'class',
                recipient:      'interface',
                request:        AtmelDFU.bRequest.DFU_DNLOAD,
                value:          0,  // wBlock
                index:          0,  // interface
            });
        console.log('byteWritten2: ' + result.bytesWritten);
        status.value = result.status;   // 'ok' or 'stall'
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    } finally {
        target = null;
        device.value = 'Not selected';
    }
}

async function recoverError() {
    try {
        let result = await clearStatus(target);
        if (result.status !== 'ok') {
            console.log('aborting...');
            result = await abort(target);
        }

        status.value = result.status;
        console.log('status: ' + result.status);
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    }
}
</script>

<template>
  <div class="greetings">
    <h1 class="green">Target: {{ device }}</h1>
    <h3>
      Device: {{ device }}
      <button :disabled="isButtonDisabled" @click="selectDevice">Select</button>
    </h3>

    <h3>
      Status: {{ status }}
      <button @click="checkStatus">Check Status</button>
    </h3>

    <h3>
      <button @click="launch">Launch</button>
    </h3>
    <h3>
      <button @click="eraseAll">Erase All</button>
    </h3>
    <h3>
      <button @click="blankCheck">Blank Check</button>
    </h3>

    <h3>
      <button @click="readFlash">Read Flash</button>
    </h3>
    <h3>
      <button @click="recoverError">Recover Error</button>
    </h3>

    <h3>
      <button @click="writeFlash">Write Flash</button>
    </h3>
  </div>
</template>

<style scoped>
h1 {
  font-weight: 500;
  font-size: 2.6rem;
  position: relative;
  top: -10px;
}

h3 {
  font-size: 1.2rem;
}

.greetings h1,
.greetings h3 {
  text-align: center;
}

@media (min-width: 1024px) {
  .greetings h1,
  .greetings h3 {
    text-align: left;
  }
}
</style>
