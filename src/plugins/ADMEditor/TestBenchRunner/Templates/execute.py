import os
import sys
import json
import shutil
import zipfile
import logging
import subprocess
import pywintypes
import win32com.client
## Setup a logger
logger = logging.getLogger()
logger.setLevel(logging.DEBUG)

# Create file handler which logs even debug messages.
if not os.path.isdir('log'):
    os.mkdir('log')

fh = logging.FileHandler(os.path.join('log', 'execute.log'))
fh.setLevel(logging.DEBUG)

# Create console handler to stdout with logging level info.
ch = logging.StreamHandler(sys.stdout)
ch.setLevel(logging.INFO)

# Create console handler to stderr with logging level error.
ch_err = logging.StreamHandler()
ch_err.setLevel(logging.ERROR)

# Create formatter and add it to the handlers.
formatter = logging.Formatter('%(asctime)s - %(name)s - %(levelname)s - %(message)s')
fh.setFormatter(formatter)
ch.setFormatter(formatter)
ch_err.setFormatter(formatter)

# Add the handlers to the logger.
logger.addHandler(fh)
logger.addHandler(ch)
logger.addHandler(ch_err)


## Obtain the root directory for the META-tools.
# Get the running meta-python path.
sys_pieces = sys.executable.split(os.path.sep)
# Drop the 'bin/Python27/Scripts/python.exe' part.
if len(sys_pieces) < 4:
    logger.error('Python script must be called using the META-python virtual env!')
    sys.exit(1)
sys_pieces = sys_pieces[:-4]
# Make sure to get the slashes after e.g. "C:".
if sys_pieces[0].endswith(':'):
    sys_pieces[0] = sys_pieces[0] + os.path.sep
# Join the pieces.
META_DIR = os.path.join(*sys_pieces)

# Disable early binding: full of race conditions writing the cache files,
# and changes the semantics since inheritance isn't handled correctly
import win32com.client.gencache
_savedGetClassForCLSID = win32com.client.gencache.GetClassForCLSID
win32com.client.gencache.GetClassForCLSID = lambda x: None


def call_subprocess_with_logging(command, my_env=None):
    """
    Calls the command, if error occurred logging is made of all non-empty returns.
    Reraises the exception putting the formatet message in returncode

    :param command: the command to be executed
    :param my_env: dictionary of environment-variables, None -> uses the default windows
    """
    logger.info("About to call : {0}".format(command))
    return_code = 0
    try:
        if my_env:
            return_out = subprocess.check_output(command, stderr=subprocess.STDOUT, env=my_env, shell=True)
        else:
            return_out = subprocess.check_output(command, stderr=subprocess.STDOUT, shell=True)
        logger.info('console output : \n{0}'.format(return_out))
    except subprocess.CalledProcessError as err:
        msg = "Subprocess call failed!"
        msg += "\n  return-code   : {0}".format(err.returncode)
        return_code = err.returncode
        if err.output:
            msg += "\n  console output: \n\n{0}".format(err.output)
        if err.message:
            msg += "\n  error message : {0}".format(err.message)
        logger.error(msg)

    return return_code



def parse_xme_and_save_to_mga(file_name):
    """
    Imports the xme project and saves it to a mga-file with the same name.
    (Will overwrite any existing mga with same path.)

    returns : mga_path : path to newly created mga
    """
    mga_file = file_name[:-4] + '.mga'
    mga_path = os.path.abspath(mga_file)
    logger.debug("About to parse .xme, mga will be saved to " + mga_path)
    parser = win32com.client.Dispatch('Mga.MgaParser')
    (paradigm, paradigm_v, paradigm_guid, basename, version) = parser.GetXMLInfo(file_name)
    logger.debug('Xme info :')
    logger.debug('  paradigm     : {0}'.format(paradigm))
    logger.debug('  paradigm_v   : {0}'.format(paradigm_v))
    import uuid
    logger.debug('  paradigm_guid: {0}'.format(str(uuid.UUID(bytes_le=paradigm_guid))))
    logger.debug('  basename     : {0}'.format(basename))
    logger.debug('  version      : {0}'.format(version))
    if paradigm != 'CyPhyML':
        raise IOError("Given xme file must be using CyPhyML as paradigm, not {0}".format(paradigm))

    project = win32com.client.Dispatch('Mga.MgaProject')
    project.Create('MGA={0}'.format(mga_path), paradigm)
    try:
        parser.ParseProject(project, file_name)
        project.Save()
        logging.debug("Mga saved to " + mga_file)
    finally:
        project.Close(True)

    return mga_path


def extract_components(src_path='ACMs', dst_path='components_extracted'):
    if os.path.isdir(dst_path):
        logging.debug('Found dir :{0} - removing and making new...'.format(dst_path))
        shutil.rmtree('\\\\?\\' + os.path.join(os.getcwd(), dst_path))
        os.mkdir(dst_path)
    files = os.listdir(src_path)
    logging.debug('Components found in directory : {0}'.format(files))
    for f_name in files:
        if f_name.endswith('.zip'):
            zippy = zipfile.ZipFile(os.path.join(src_path, f_name))
            zippy.extractall('\\\\?\\' + os.path.join(os.getcwd(), dst_path, f_name.rstrip('.zip')))


def import_components(mga_path, dir_path='components_extracted'):
    exec_name = 'CyPhyComponentImporterCL.exe'
    exec_path = os.path.join(META_DIR, 'bin', exec_name)
    if not os.path.isfile(exec_path):
        logging.debug('Did not find {0} in bin directory.'.format(exec_name))
        logging.debug('Assuming developer machine, looking in src directory...'.format(exec_name))
        exec_path = os.path.join(META_DIR, 'src', 'CyPhyComponentImporterCL', 'bin', 'Release', exec_name)
        if not os.path.isfile(exec_path):
            raise IOError('Did not find {0}'.format(exec_path))

    command = '"{0}" -r "{1}" "{2}"'.format(exec_path, dir_path, mga_path)
    rc = call_subprocess_with_logging(command)

    return rc


def import_design(mga_path, adm_file, testbench_config):
    project_conn_str = 'MGA={0}'.format(mga_path)
    project = win32com.client.Dispatch('Mga.MgaProject')
    project.Open(project_conn_str)
    design_ids = []
    is_in_transaction = False
    try:
        design_importer = win32com.client.Dispatch('MGA.Interpreter.CyPhyDesignImporter')
        design_importer.Initialize(project)
        logger.debug('About to begin transaction..')
        project.BeginTransactionInNewTerr()
        logger.debug('Transaction began.')
        is_in_transaction = True
        ## Find the test-bench and find the design placeholder.
        testbench_mga = project.ObjectByPath(testbench_config['path'])
        if not testbench_mga:
            raise RuntimeError('Given test-bench path "' + testbench_config['path'] + '" does not exist in project!')
        try:
            logger.debug('Path returned MgaObject of type: {0}'.format(testbench_mga.MetaBase.Name))
            if not testbench_mga.MetaBase.Name == 'TestBench':
                raise NotImplementedError('Only CyPhy TestBench supported!')
            testbench_id = testbench_mga.ID
            logger.debug('Found test-bench "{0}".'.format(testbench_mga.Name))
            logger.debug('Test-bench ID : {0}.'.format(testbench_id))
            tlsut_mga = [o for o in testbench_mga.GetChildrenOfKind('TopLevelSystemUnderTest')][0]
            logger.debug('TopLevelSystem under test {0} refers to :'.format(tlsut_mga.Name))
            logger.debug(' "{0}" ({1})'.format(tlsut_mga.Referred.Name, tlsut_mga.Referred.MetaBase.Name))
        except pywintypes.com_error as err:
            logger.error(err.message)
            raise RuntimeError('Given test-bench not found or setup correctly.')
        ## Import the design.
        logger.debug('Calling CyPhyDesignImporter.ImportDesign.')
        design_mga = design_importer.ImportDesignToDesignSpace(project, adm_file)
        design_id = design_mga.ID
        logger.debug('Design imported:')
        logger.debug(' Name : {0}'.format(design_mga.Name))
        logger.debug(' Type : {0}'.format(design_mga.MetaBase.Name))
        logger.debug(' ID : {0}'.format(design_id))
        logger.debug(' Path : {0}'.format(design_mga.AbsPath))

        if design_mga.MetaBase.Name == 'DesignContainer':
            logger.info('Creating DesignSpaceHelper')
            desert = win32com.client.Dispatch('MGA.Interpreter.DesignSpaceHelper')
            desert.Initialize(project)
            logger.info('Calling InvokeEx')
            selectedObjs = win32com.client.Dispatch('Mga.MgaFCOs')
            desert.InvokeEx(project, design_mga, selectedObjs, 128)
            configurations = design_mga.GetChildrenOfKind('Configurations')
            if configurations.Count == 0:
                logger.warning('No Configurations found')
            for cc in configurations:
                logger.info('Found Configurations "{0}" inside design.'.format(cc.Name))
                cfg_mgas = cc.GetChildrenOfKind('CWC')
                for cfg_mga in cfg_mgas:
                    logger.info(cfg_mga.AbsPath)
                    design_ids.append(cfg_mga.ID)
        else:
            design_ids.append(design_id)
        ## Reference the design from the top-level-system-under-test.
        logger.debug('Creating ReferenceSwitcher')
        ref_switcher = win32com.client.Dispatch('MGA.Interpreter.ReferenceSwitcher')
        logger.debug('Switching referred in test-bench to design.')
        tlsut_mga.Name = design_mga.Name
        ref_switcher.SwitchReference(design_mga, tlsut_mga)
        logger.debug('Design was placed in test-bench.')
        logger.debug('About to commit transaction..')
        project.CommitTransaction()
        logger.debug('Transaction committed.')
        is_in_transaction = False
    finally:
        if is_in_transaction:
            logger.debug('About to abort transaction..')
            project.AbortTransaction()
            logger.debug('Transaction aborted.')
            project.Close(True)
        else:
            logger.debug('About to save project..')
            project.Close(False)
            logger.debug('Project saved.')

    return testbench_id, design_ids


def call_master_interpreter(mga_path, test_bench_id, cfg_ids):
    project_conn_str = 'MGA={0}'.format(mga_path)
    project = win32com.client.Dispatch('Mga.MgaProject')
    project.Open(project_conn_str)
    nbr_of_failures = 0
    nbr_of_cfgs = 0
    try:
        logger.debug('Creating CyPhyMasterInterpreterAPI')
        mi = win32com.client.Dispatch('CyPhyMasterInterpreter.CyPhyMasterInterpreterAPI')
        mi.Initialize(project)
        logger.debug('Creating ConfigurationSelectionLight')
        config_light = win32com.client.Dispatch('CyPhyMasterInterpreter.ConfigurationSelectionLight')
        config_light.ContextId = test_bench_id
        config_light.SetSelectedConfigurationIds(cfg_ids)
        config_light.KeepTemporaryModels = False
        config_light.PostToJobManager = False
        mi_results = mi.RunInTransactionWithConfigLight(config_light)
        mi.WriteSummary(mi_results)

        for res in mi_results:
            nbr_of_cfgs += 1
            logger.info('MasterInterpreter result : {0}'.format(res.Message))
            if not res.Success:
                logger.error('MasterIntpreter failed : {0}, Exception : {1}'.format(res.Message, res.Exception))
                nbr_of_failures += 1
        if nbr_of_failures > 0:
            with open('_FAILED.txt', 'ab+') as f_out:
                f_out.write('MasterInterprter failed on ' + str(nbr_of_failures) + ' out of ' + str(nbr_of_cfgs) +
                            ' configurations. See log/execution.log and log/MasterInerpter.xxxx.log for more info.')
    finally:
        project.Close(True)

    if nbr_of_failures == nbr_of_cfgs:
        logger.error('No succeeded configurations from MasterInterpreter, aborting script..')
        sys.exit(1)


def run_execution_jobs():
    jobs = []
    for root, dirs, files in os.walk('results'):
        for f in files:
            if f == 'testbench_manifest.json':
                with open(os.path.join(root, 'testbench_manifest.json'), 'r') as f_in:
                    tb_dict = json.load(f_in)
                    if len(tb_dict['Steps']) == 0:
                        logger.warning('Skipping job for design ' + tb_dict['DesignID'] + ' in ' + root +
                                       ', since there are no steps. MasterInterpreter probably failed on this design.')
                    else:
                        cmd = tb_dict['Steps'][0]['Invocation']
                        logger.info('Found cmd {0}'.format(cmd))
                        job = {'cmd': cmd, 'dir': root, 'designId': tb_dict['DesignID']}
                        jobs.append(job)
                        logger.info('Added job {0}'.format(job))
                break
    root_dir = os.getcwd()
    if os.path.isdir('testbench_manifests'):
        shutil.rmtree('testbench_manifests')
    os.mkdir('testbench_manifests')
    failed_jobs = 0
    nbr_of_jobs = len(jobs)
    for job in jobs:
        os.chdir(job['dir'])
        try:
            rc = call_subprocess_with_logging(job['cmd'])
            if rc != 0:
                logger.error('call failed! {0} in {1}'.format(job['cmd'], job['dir']))
                failed_jobs += 1
            elif os.path.isfile('_FAILED.txt'):
                logger.error('Job "{0}" created _FAILED.txt'.format(job['cmd']))
                failed_jobs += 1
                with open('_FAILED.txt', 'r') as f_in:
                    logger.error('\r\n'.join(f_in.readlines()))
        finally:
            os.chdir(root_dir)
    if failed_jobs > 0:
        with open('_FAILED.txt', 'ab+') as f_out:
            f_out.write(str(failed_jobs) + ' of ' + str(nbr_of_jobs) +' jobs failed! See logs/execute.log.')


def move_dashboard_files(new_dir):

    # Entire directories
    dashboard_dir = 'dashboard'
    designs_dir = 'designs'
    design_space_dir = 'design-space'
    requirements_dir = 'requirements'
    test_benches_dir = 'test-benches'
    results_dir = 'results'

    # Single files
    meta_results_file = os.path.join(results_dir, 'results.metaresults.json')
    project_file = 'manifest.project.json'
    index_html = 'index.html'

    # Delete/Create new result directory.
    if os.path.isdir(new_dir):
        shutil.rmtree(new_dir)
    os.mkdir(new_dir)
    os.mkdir(os.path.join(new_dir, results_dir))
    # Copy single files.
    shutil.copy(meta_results_file, os.path.join(new_dir, meta_results_file))
    shutil.copy(project_file, os.path.join(new_dir, project_file))
    shutil.copy(index_html, os.path.join(new_dir, index_html))
    # Copy entire directories.
    shutil.copytree(dashboard_dir, os.path.join(new_dir, dashboard_dir))
    shutil.copytree(designs_dir, os.path.join(new_dir, designs_dir))
    shutil.copytree(design_space_dir, os.path.join(new_dir, design_space_dir))
    shutil.copytree(requirements_dir, os.path.join(new_dir, requirements_dir))
    shutil.copytree(test_benches_dir, os.path.join(new_dir, test_benches_dir))

    for dir_path in (os.path.join(results_dir, dd) for dd in os.listdir(results_dir)):
        if os.path.isdir(dir_path):
            tm_path = os.path.join(dir_path, 'testbench_manifest.json')
            if os.path.isfile(tm_path):
                os.mkdir(os.path.join(new_dir, dir_path))
                shutil.copy(tm_path, os.path.join(new_dir, tm_path))


if __name__ == '__main__':
    with zipfile.ZipFile('tbAsset.zip') as zippy:
        zippy.extractall('.')
    try:
        adm_path = [f for f in os.listdir('.') if f.endswith('.adm')][0]
    except IndexError:
        logger.error('Could not find an adm at {0}'.format(os.getcwd()))
        with open('_FAILED.txt', 'ab+') as f_out:
            f_out.write('Execution failed! See logs/execute.log.')
        sys.exit(1)
    try:
        xme_path = [f for f in os.listdir('.') if f.endswith('.xme')][0]
    except IndexError:
        logger.error('Could not find an adm or xme file at {0}'.format(os.getcwd()))
        with open('_FAILED.txt', 'ab+') as f_out:
            f_out.write('Execution failed! See logs/execute.log.')
        sys.exit(1)
    with open('testbench_config.json', 'r') as f_in:
        test_bench_config = json.load(f_in)
    extract_components()
    logger.info('(1) Components extracted...')
    mga_file = parse_xme_and_save_to_mga(xme_path)
    logger.info('(2) Mga created...')
    rc = import_components(mga_file)
    if rc == 0:
        logger.info('(3) Components imported...')
    else:
        logger.error('Components could not be imported!')
        with open('_FAILED.txt', 'ab+') as f_out:
            f_out.write('Execution failed! See logs/execute.log.')
        sys.exit(1)
    try:
        test_bench_id, cfg_ids = import_design(mga_file, adm_path, test_bench_config)
    except Exception as err:
        import traceback
        the_trace = traceback.format_exc()
        logger.error('Exception raised in "import_design": {0}'.format(the_trace))
        error_msg = err.message
        if hasattr(err, 'excepinfo'):
            error_msg = '{0} : {1}'.format(error_msg, err.excepinfo)
        with open('_FAILED.txt', 'ab+') as f_out:
            f_out.write('Could not import design and place it correctly in test-bench. Exception message : ' +
                        error_msg + ' See logs for more info.')
            sys.exit(1)

    logger.info('(4) Design imported and placed in test-bench.')
    call_master_interpreter(mga_file, test_bench_id, cfg_ids)
    logger.info('(5) MasterInterpreter finished.')
    run_execution_jobs()
    logger.info('(6) Job execution completed.')
