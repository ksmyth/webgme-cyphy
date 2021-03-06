/**
* Generated by PluginGenerator from webgme on Tue Apr 29 2014 17:05:39 GMT-0500 (Central Daylight Time).
*/

'use strict';
if (typeof window === 'undefined') {
    // server-side setup
    var requirejs = require('requirejs');
    require('../../../../../test-conf.js');

    var chai = require('chai'),
        should = chai.should(),
        assert = chai.assert,
        expect = chai.expect;
}

// TODO: Update this with a more to-the-point regular expression
var semanticVersionPattern = /^\d+\.\d+\.\d+$/;

describe('AdmExporter', function () {
    var plugin;

    before(function (done) {
        requirejs(['plugin/AdmExporter/AdmExporter/AdmExporter'], function (AdmExporter) {
            plugin = new AdmExporter();
            // TODO: Add option for generating createMETATypesTests and including core etc.
            //core = new Core();
            //meta = createMETATypesTests(core);
            //rootNode = core.getRootNode();
            //modelsNode = core.createNode({base: meta.ModelElement, parent: rootNode});
            //core.setAttribute(modelsNode, 'name', 'Models');
        done();
        });
    });

    it('getVersion', function () {
        expect(semanticVersionPattern.test(plugin.getVersion())).to.equal(true);
    });

    it('getDescription', function () {
        var description = plugin.getDescription();
        expect(typeof description === 'string' || description instanceof String).to.equal(true);
    });

    it('getName', function () {
        var name = plugin.getName();
        expect(typeof name === 'string' || name instanceof String).to.equal(true);
    });

    it('main should be implemented', function () {
        var proto = Object.getPrototypeOf(plugin);
        expect(proto.hasOwnProperty('main')).to.equal(true);
    });

    it('startsWith should return true 1', function () {
        expect(plugin.startsWith('Adms', 'Adm')).to.equal(true);
    });

    it('startsWith should return true 2', function () {
        expect(plugin.startsWith('Adms', 'Adms')).to.equal(true);
    });

    it('startsWith should return true 3', function () {
        expect(plugin.startsWith('Adms', '')).to.equal(true);
    });

    it('startsWith should return false 1', function () {
        expect(plugin.startsWith('Adms', 'ADms')).to.equal(false);
    });

    it('startsWith should return false 2', function () {
        expect(plugin.startsWith('Adm', 'Adms')).to.equal(false);
    });

    it('startsWith should return false 3', function () {
        expect(plugin.startsWith('Adm', ' Ad')).to.equal(false);
    });

    it('appendWhiteSpacedString 1', function () {
        expect(plugin.appendWhiteSpacedString('Adm', 'Ad')).to.equal('Adm Ad');
    });

    it('appendWhiteSpacedString 2', function () {
        expect(plugin.appendWhiteSpacedString('Adm', '')).to.equal('Adm');
    });

    it('appendWhiteSpacedString 3', function () {
        expect(plugin.appendWhiteSpacedString('', 'Adm')).to.equal('Adm');
    });

    it('appendWhiteSpacedString 4', function () {
        expect(plugin.appendWhiteSpacedString('', '')).to.equal('');
    });
});