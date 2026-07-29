"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
var jspdf_1 = __importDefault(require("jspdf"));
var jspdf_autotable_1 = __importDefault(require("jspdf-autotable"));
// just checking TS compilation with autoTable
var doc = new jspdf_1.default();
(0, jspdf_autotable_1.default)(doc, {
    head: [['Name', 'Email']],
    body: [['John', 'john@example.com']],
});
