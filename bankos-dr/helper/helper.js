const fs = require('fs');

let date_ob = new Date();
let date = ("0" + date_ob.getDate()).slice(-2);
let month = ("0" + (date_ob.getMonth() + 1)).slice(-2);
let year = date_ob.getFullYear();
let hours = date_ob.getHours();
let minutes = date_ob.getMinutes();
let seconds = date_ob.getSeconds();

var util = require('util');
var log_file = fs.createWriteStream(`${year}-${month}-${date}_${hours}-${minutes}-${seconds}.log`, {flags : 'a'});
var log_stdout = process.stdout;

const custom_logging = function(d) {
    log_file.write(util.format('[' + new Date().toISOString() + '] ' + d) + '\n');
    log_stdout.write(util.format('[' + new Date().toISOString() + '] ' + d) + '\n');
};

const find_in_array_by_key_and_val = function(arr, key, val) {
    if (!Array.isArray(arr)) {
        console.error('Error: Provided data is not an array:', arr);
        return null;
    }

    console.log(`Searching for '${val}' in key '${key}'`);

    for (const item of arr) {
        console.log('Checking item:', item);

        // Check if key exists in the object
        if (item.hasOwnProperty(key)) {
            console.log(`Comparing item[${key}] (${item[key]}) with '${val}'`);
            if (item[key] === val) {
                console.log('Match found:', item);
                return item;
            }
        } else {
            console.log(`Key '${key}' not found in item`, item);
        }
    }

    console.log(`Configuration not found for key '${key}' with value '${val}'`);
    return null;
};

module.exports = { custom_logging, find_in_array_by_key_and_val };
