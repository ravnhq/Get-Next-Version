/* eslint-disable no-console */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-var-requires */
/* eslint-disable @typescript-eslint/no-require-imports */
/* eslint-disable import/no-dynamic-require */
/* eslint-disable @typescript-eslint/explicit-function-return-type */

import * as core from '@actions/core'
import {exec} from '@actions/exec'
import fs from 'fs'
import gitSemverTags from 'git-semver-tags'
import path from 'path'
import semver from 'semver'

const gitSemverTagsAsync = async (options: gitSemverTags.Options = {}) =>
  new Promise<string[]>((resolve, reject) =>
    gitSemverTags(options, (error, tags) => {
      if (error) {
        reject(error)
      } else {
        resolve(tags)
      }
    })
  )

async function run() {
  const versionToCompare = core.getInput('version')
  const bumpType = core.getInput('bump-type') || 'patch'
  const packageJsonPath = core.getInput('package-json-path') || 'package.json'

  if (!['major', 'minor', 'patch'].includes(bumpType)) {
    core.setFailed('bump-type must be one of: major, minor, patch')
  }

  try {
    let latestVersion = versionToCompare
    if (!versionToCompare) {
      const tags = await gitSemverTagsAsync()
      latestVersion = tags[0] ?? '0.0.1'
    }

    const versionFilePath = path.join(
      process.env.GITHUB_WORKSPACE!,
      packageJsonPath
    )

    if (!fs.existsSync(versionFilePath)) {
      core.setFailed(`Couldn't find version file at: ${versionFilePath}`)
    }

    core.info(`Using package.json file at: ${packageJsonPath}`)

    const packageVersion = require(versionFilePath).version ?? '1.0.0'

    core.info(
      `Compare version: ${latestVersion} with package version: ${packageVersion}`
    )

    if (semver.lte(latestVersion, packageVersion)) {
      core.info('Package version is behind, bumping')

      console.log('SWAG')

      let newVersion = ''
      let versionError = ''

      const options = {
        listeners: {
          stdout: (data: Buffer) => {
            newVersion += data.toString()
          },
          stderr: (data: Buffer) => {
            versionError += data.toString()
          }
        }
      }

      await exec(
        'npm',
        [
          `--prefix=${path.relative(
            process.cwd(),
            path.parse(versionFilePath).dir
          )}`,
          '--git-tag-version=false',
          'version',
          bumpType
        ],
        options
      )

      console.log(versionError)
      if (versionError) {
        return core.setFailed(versionError)
      }

      const cleanNewVersion = semver.clean(newVersion)
      console.log(cleanNewVersion)

      if (!semver.parse(cleanNewVersion)) {
        return core.setFailed(`Error parsing version ${cleanNewVersion}`)
      }

      const {major, minor, patch} = semver.parse(cleanNewVersion)!

      console.log({major, minor, patch, packageVersion, cleanNewVersion})

      core.setOutput('previous_version', packageVersion)
      core.setOutput('new_version', cleanNewVersion)
      core.setOutput('major', major)
      core.setOutput('minor', minor)
      core.setOutput('patch', patch)
      core.setOutput('bumped', true)
    } else {
      core.info('Package version is ahead, skipping')
      core.setOutput('bumped', false)
    }
  } catch (error) {
    console.error(error)
    if (error instanceof Error) {
      core.error(error)
      core.setFailed(error.message)
    } else if (typeof error === 'string') {
      core.error(error)
      core.setFailed(error)
    }
  }
}

run()
