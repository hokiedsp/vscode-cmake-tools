import * as chai from 'chai';
import * as chaiAsPromised from 'chai-as-promised';
chai.use(chaiAsPromised);

import {expect} from 'chai';
import sinon = require('sinon');
import * as vscode from 'vscode';
import * as path from 'path';

import {clearExistingKitConfigurationFile, getExtension} from '../../../test_helpers';
import {CMakeTools} from '../../../../src/cmake-tools';
import {fs} from '../../../../src/pr';
import {normalizePath} from '../../../../src/util';

class BuildDirectory {

  private location: string;

  private locationOfThisClassFile: string = __dirname;

  private getProjectRootDirectory(): string {
    return path.normalize(
        path.join(this.locationOfThisClassFile, '../../../../../test/extension_tests/successful_build/project_folder'));
  }

  public constructor(relative_location_to_root: string = 'build') {
    this.location = path.join(this.getProjectRootDirectory(), relative_location_to_root);
  }

  public async Clear() {
    if (await fs.exists(this.location)) {
      fs.rmdir(this.location);
    }
  }

  public get Location(): string { return this.location; }

  public get IsCMakeCachePresent(): Promise<boolean> { return fs.exists(path.join(this.Location, "CMakeCache.txt")); }
}

class TestProgramResult {

  private result_file_location: string;

  public constructor(location: string, filename: string = 'output.txt') {
    this.result_file_location = normalizePath(path.join(location, filename));
  }

  public get IsPresent(): Promise<boolean> { return fs.exists(this.result_file_location); }

  public async GetResultAsJson(): Promise<any> {
    expect(await this.IsPresent).to.eq(true, 'Test programm result file was not found');
    const content = await fs.readFile(this.result_file_location);
    expect(content.toLocaleString()).to.not.eq('');

    return JSON.parse(content.toString());
  }
}

class DefaultEnvironment {

  sandbox: sinon.SinonSandbox;
  buildDir: BuildDirectory;
  result: TestProgramResult;

  public constructor(build_location: string = 'build', executableResult: string = 'output.txt') {
    this.buildDir = new BuildDirectory(build_location);
    this.result = new TestProgramResult(this.buildDir.Location, executableResult);

    // clean build folder
    this.sandbox = sinon.sandbox.create();
    this.sandbox.stub(vscode.window, 'showQuickPick').callsFake(function(items: string[]): Thenable<string|undefined> {
      return Promise.resolve(items[1]);  // How do we make it plattform independent?
    });
  }

  public teardown(): void { this.sandbox.restore(); }
}

(process.env.HasVs === 'true' ? suite : suite.skip)('Build', async() => {
  let cmt: CMakeTools;
  let testEnv: DefaultEnvironment;

  suiteSetup(async function(this: Mocha.IHookCallbackContext) {
    this.timeout(30000);
    testEnv = new DefaultEnvironment();

    cmt = await getExtension();
    // tslint:disable-next-line:no-unused-expression
    expect(cmt).to.be.not.undefined;

    // This test will use all on the same kit.
    // No rescan of the tools is needed
    // No new kit selection is needed
    clearExistingKitConfigurationFile();
    await cmt.scanForKits();
    await cmt.selectKit();
  });
  suiteTeardown(async function(this: Mocha.IHookCallbackContext) {
    this.timeout(10000);
    testEnv.teardown();
    await cmt.stop();
  })

  setup(async() => { testEnv.buildDir.Clear(); });

  teardown(async() => { await cmt.stop(); });

  test('Configure ', async() => {
    expect(await cmt.configure()).to.be.eq(0);

    // tslint:disable-next-line:no-unused-expression
    expect(await testEnv.buildDir.IsCMakeCachePresent).to.be.true;
  }).timeout(60000);

  test('Build', async() => {
    expect(await cmt.build()).to.be.eq(0);

    const result = await testEnv.result.GetResultAsJson();
    expect(result['compiler']).to.eq('Microsoft Visual Studio');
    expect(result['cmake-version']).to.eq('3.9');
  }).timeout(60000);
});
