<script setup>
import { ref } from 'vue'
import * as AtmelDFU from './AtmelDFU.js'

defineProps({
  d: {
    type: String,
    required: true,
  },
})


/*
 * Actions
 */
let isButtonDisabled = false;
var target = null; // USBDevice
const device = ref('Not Selected');
const status = ref('');


async function selectDevice() {
    try {
        target = await AtmelDFU.getAtmelDevice();

        device.value = target.productName;
        console.log(target.productName);
        console.log(target.manufacturerName);
    } catch(e) {
        target = null;
        device.value = 'Not selected';
        console.log(e);
    }
}

async function checkStatus() {
    if (target === null) {
        status.value = 'no target';
        return;
    }
    try {
        let result = await AtmelDFU.getStatus(target);

        status.value = result.status;
        let stat = AtmelDFU.parseStatus(result.data);
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

async function eraseChip() {
    try {
        let result = await AtmelDFU.chipErase(target);
        console.log('byteWritten: ' + result.bytesWritten);
        status.value = result.status;
    } catch(e) {
        device.value = 'Invalid';
        status.value = 'error';
        console.log(e);
    }
}

async function checkBlank() {
    try {
        // TODO:
        // atmeaga32u2/u4
        //      App: 28KB  0x0000 ... 0x6fff
        //      Flash: 32KB, Bootloader: 4KB
        let result = await AtmelDFU.blankCheck(target, 0x0000, 0x6fff);
        console.log('byteWritten: ' + result.bytesWritten);

        result = await AtmelDFU.getStatus(target);
        let stat = AtmelDFU.parseStatus(result.data);
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

async function writeFlash() {
    try {
        let result = await AtmelDFU.writeBlock(target, 0x0000, 0x5, [0, 1, 2, 3, 4, 5]);
        console.log('byteWritten: ' + result.bytesWritten);
        console.log('status: ' + result.status);
        status.value = result.status;
    } catch (e) {
        console.log(e);
    }
}

async function readFlash() {
    try {
        let result = await AtmelDFU.readBlock(target, 0x0000, 0x6fff);
        console.log('status: ' + result.status);
        status.value = result.status;

        for (let i = 0; i < result.data.byteLength; i++) {
            if (result.data.getUint8(i) !== 0xff) {
                console.log(i.toString(16) + ': ' + result.data.getUint8(i).toString(16));
            }
        }
        console.log('byteLength: ' + result.data.byteLength);
    } catch (e) {
        console.log(e);
    }
}

async function writeEEPROM() {
    try {
        let result = await AtmelDFU.writeBlock(target, 0x0000, 0x5, [0x10, 0x11, 0x12, 0x13, 0x14, 0x15], true);
        console.log('byteWritten: ' + result.bytesWritten);
        console.log('status: ' + result.status);
        status.value = result.status;
    } catch (e) {
        console.log(e);
    }
}

async function readEEPROM() {
    try {
        let result = await AtmelDFU.readBlock(target, 0x0000, 0x03ff, true);
        console.log('status: ' + result.status);
        status.value = result.status;

        for (let i = 0; i < result.data.byteLength; i++) {
            if (result.data.getUint8(i) !== 0xff) {
                console.log(i.toString(16) + ': ' + result.data.getUint8(i).toString(16));
            }
        }
        console.log('byteLength: ' + result.data.byteLength);
    } catch (e) {
        console.log(e);
    }
}

async function startApp() {
    try {
        let result = await AtmelDFU.launch(target);
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
        let result = await AtmelDFU.clearStatus(target);
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
      <button :disabled="isButtonDisabled" @click="selectDevice">Select Device</button>
    </h3>

    <h3>
      Status: {{ status }}
      <button @click="checkStatus">Check Status</button>
    </h3>

    <h3>
      <button @click="eraseChip">Erase Chip</button>
      <button @click="checkBlank">Check Blank</button>
    </h3>

    <h3>
      <button @click="writeFlash">Write Flash</button>
      <button @click="readFlash">Read Flash</button>
    </h3>

    <h3>
      <button @click="writeEEPROM">Write EEPROM</button>
      <button @click="readEEPROM">Read EEPROM</button>
    </h3>

    <h3>
      <button @click="startApp">Start App</button>
      <button @click="recoverError">Recover Error</button>
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
