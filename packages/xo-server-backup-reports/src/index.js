import forEach from 'lodash.foreach'
import moment from 'moment'

export const configurationSchema = {
  type: 'object',
  description: 'a array of emails (receivers)',
  properties: {
    to: {
      type: 'array',
      items: {
        type: 'string'
      },
      minItems: 1
    }
  }
}

// ===================================================================

class BackupReportsXoPlugin {
  constructor (xo) {
    this._xo = xo
    this._report = ::this._wrapper
  }

  configure ({to}) {
    this._receivers = to
  }

  load () {
    this._xo.on('job:terminated', this._report)
  }

  unload () {
    this._xo.removeListener('job:terminated', this._report)
  }

  async _wrapper (status) {
    try {
      await this._listener(status)
    } catch (e) {
      console.error('backup report error: ' + e)
    }
  }

  async _listener (status) {
    let nSuccess = 0
    let nCalls = 0

    const text = []

    forEach(status.calls, call => {
      // Ignore call if it's not a Backup or a Snapshot.
      if (call.method !== 'vm.rollingBackup' && call.method !== 'vm.rollingSnapshot') {
        return
      }

      let vmStatus

      if (call.error) {
        vmStatus = 'Fail'
      } else {
        nSuccess++
        vmStatus = 'Success'
      }

      nCalls++

      let vm

      try {
        vm = this._xo.getObject(call.params.id)
      } catch (e) {}

      const start = moment(call.start)
      const end = moment(call.end)
      const duration = moment.duration(end - start).humanize()

      text.push([
        `### VM : ${vm ? vm.name_label : 'undefined'}`,
        `  - UUID: ${vm ? vm.uuid : 'undefined'}`,
        `  - Status: ${vmStatus}`,
        `  - Start time: ${String(start)}`,
        `  - End time: ${String(end)}`,
        `  - Duration: ${duration}`
      ].join('\n'))
    })

    // No backup calls.
    if (nCalls === 0) {
      return
    }

    const globalStatus = nSuccess === nCalls ? 'Success' : 'Fail'
    const start = moment(status.start)
    const end = moment(status.end)
    const duration = moment.duration(end - start).humanize()

    // Global status.
    text.unshift([
      `## Global status: ${globalStatus}`,
      `  - Start time: ${String(start)}`,
      `  - End time: ${String(end)}`,
      `  - Duration: ${duration}`,
      `  - Successful backed up VM number: ${nSuccess}`,
      `  - Failed backed up VM: ${nCalls - nSuccess}`
    ].join('\n'))

    // TODO : Handle errors when `sendEmail` isn't present. (Plugin dependencies)
    await this._xo.sendEmail({
      to: this._receivers,
      subject: 'Backup Reports (XenOrchestra)',
      markdown: text.join('\n')
    })
  }
}

// ===================================================================

export default ({xo}) => new BackupReportsXoPlugin(xo)
