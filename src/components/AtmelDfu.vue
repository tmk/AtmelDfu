<script setup>
import { ref } from 'vue'

defineProps({
  d: {
    type: String,
    required: true,
  },
})

// https://ww1.microchip.com/downloads/en/DeviceDoc/doc7618.pdf
const AtmelDFU = {};
// bRequest
AtmelDFU.request = {};
AtmelDFU.request.DFU_DETACH = 0;
AtmelDFU.request.DFU_DNLOAD = 1;
AtmelDFU.request.DFU_UPLOAD = 2;
AtmelDFU.request.DFU_GETSTATUS = 3;
AtmelDFU.request.DFU_CLRSTATUS = 4;
AtmelDFU.request.DFU_GETSTATE = 5;
AtmelDFU.request.DFU_ABORT = 6;
// bStatus
AtmelDFU.bStatus = {};
AtmelDFU.bStatus.OK = 0;
AtmelDFU.bStatus.errTARGET = 1;
AtmelDFU.bStatus.errFILE = 2;
AtmelDFU.bStatus.errWRITE = 3;
AtmelDFU.bStatus.errERASE = 4;
AtmelDFU.bStatus.errCHECK_ERASED = 5;
AtmelDFU.bStatus.errPROG = 6;
AtmelDFU.bStatus.errVERIFY = 7;
AtmelDFU.bStatus.errADDRESS = 8;
AtmelDFU.bStatus.errNOTDONE = 9;
AtmelDFU.bStatus.errFIRMWARE = 10;
AtmelDFU.bStatus.errVENDOR = 11;
AtmelDFU.bStatus.errUSBR = 12;
AtmelDFU.bStatus.errPOR = 13;
AtmelDFU.bStatus.errUNKNOWN = 14;
AtmelDFU.bStatus.errSTALLEDPK = 15;
// bState
AtmelDFU.bState = {};
AtmelDFU.bState.appIDLE = 0;
AtmelDFU.bState.appDETACH = 1;
AtmelDFU.bState.dfuIDLE = 2;
AtmelDFU.bState.dfuDNLOAD_SYNC = 3;
AtmelDFU.bState.dfuDNBUSY = 4;
AtmelDFU.bState.dfuDNLOAD_IDLE = 5;
AtmelDFU.bState.dfuMANIFEST_SYNC = 6;
AtmelDFU.bState.dfuMANIFEST = 7;
AtmelDFU.bState.dfuMANIFEST_WAIT_RESET = 8;
AtmelDFU.bState.dfuUPLOAD_IDLE = 9;
AtmelDFU.bState.dfuERROR = 10;


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
        console.error(error);
        device.value = 'Not selected';
    }
}
/*
const selectDevice = async() => {
    navigator.usb
        .requestDevice({ filters: [{ vendorId: 0x03eb }] })
        .then((d) => {
            target = d;
            device.value = d.productName;
            console.log(d.productName);
            console.log(d.manufacturerName);
        })
        .catch((error) => {
            console.error(error);
            device.value = 'Not selected';
        });
};
*/

const status = ref('');

async function getStatus() {
    if (target != null) {
        try {
            let result = await target.controlTransferIn(
                {
                    requestType:    'class',
                    recipient:      'interface',
                    request:        AtmelDFU.request.DFU_GETSTATUS,
                    value:          0,
                    index:          0,  // interface
                },
                6 /* length */);
            status.value = result.status;   // 'ok', 'stall', or 'babble'
            console.log('status: ' + result.data.getUint8(0));  // bStatus
            console.log('state: ' + result.data.getUint8(4));   // bState
        } catch(e) {
            device.value = 'Invalid';
            status.value = 'error';
            console.log(e);
        };
    } else {
        status.value = 'no target';
    }
};

async function getState() {
    if (target != null) {
        try {
            await target.open();
            await target.claimInterface(0);
            let result = await target.controlTransferIn(
                {
                    requestType:    'class',
                    recipient:      'interface',
                    request:        AtmelDFU.request.DFU_GETSTATE,
                    value:          0,
                    index:          0,  // interface
                },
                1 /* length */);
            status.value = result.status;   // 'ok', 'stall', or 'babble'
            console.log('state: ' + result.data.getUint8(0));   // bState
        } catch(e) {
            device.value = 'Invalid';
            status.value = 'error';
            console.log(e);
        };
    } else {
        status.value = 'no target';
    }
};

async function launch() {
    if (target != null) {
        try {
            await target.open();
            await target.claimInterface(0);
            const data = new Uint8Array([ 0x04, 0x03, 0x00 ]);
            let result = await target.controlTransferOut(
                {
                    requestType:    'class',
                    recipient:      'interface',
                    request:        AtmelDFU.request.DFU_DNLOAD,
                    value:          0,  // wBlock
                    index:          0,  // interface
                },
                data);
            console.log('byteWritten1: ' + result.bytesWritten);
            result = await target.controlTransferOut(
                {
                    requestType:    'class',
                    recipient:      'interface',
                    request:        AtmelDFU.request.DFU_DNLOAD,
                    value:          0,  // wBlock
                    index:          0,  // interface
                });
            console.log('byteWritten2: ' + result.bytesWritten);
            status.value = result.status;   // 'ok' or 'stall'
        } catch(e) {
            device.value = 'Invalid';
            status.value = 'error';
            console.log(e);
        };
    } else {
        status.value = 'no target';
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
      <button @click="getStatus">Get Status</button>
    </h3>
    <h3>
      <button @click="getState">Get State</button>
    </h3>
    <h3>
      <button @click="launch">Launch</button>
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
