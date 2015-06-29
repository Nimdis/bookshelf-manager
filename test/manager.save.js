var assert  = require('assert');
var deep    = require('deep-diff');

var Bootstrap = require('./support/bootstrap');

describe('manager', function() {
  describe('.save', function() {
    var manager;

    beforeEach(function() {
      manager = Bootstrap.manager(Bootstrap.database());
      Bootstrap.models(manager);
      return Bootstrap.tables(manager)
      .then(function() {
        return Bootstrap.fixtures(manager);
      });
    });

    it('should return a promise', function() {
      var car     = manager.forge('car');
      var promise = manager.save(car);

      assert.ok(promise.then instanceof Function, 'Expected Function.  `then` is ' + typeof promise.then);
    });

    it('should save a new model', function() {
      var car = manager.forge('car');

      return manager.save(car).then(function(car) {
        assert.equal(2, car.id, 'Car should have an ID of 2, not ' + car.id);
      });
    });

    it('should save an existing model with same ID', function() {
      var Make      = manager.get('make');
      var original  = new Make({
        name: 'Ford'
      });

      return manager.save(original).then(function() {
        return manager.save(new Make(), {
          id: original.id,
          name: 'Chevy'
        });
      }).then(function(make) {
        assert.equal(original.id, make.id, 'Should have overriden original model ID');
      }).then(function() {
        return manager.fetch('makes');
      }).then(function(makes) {
        assert.equal(2, makes.length, 'Should only have 2 makes, not ' + makes.length);
      });
    });

    it('should modify the model', function() {
      return manager.fetch('car', { id: 1 }).then(function(car) {
        assert.equal(1, car.get('quantity'), 'Car #1 should start with quantity of 1');

        return manager.save(car, {
          quantity: 2
        });
      }).then(function(car) {
        assert.equal(2, car.get('quantity'), 'Car #1 should end with quantity of 2');
      });
    });

    it('should modify a nested model', function() {
      return manager.fetch('car', { id: 1 }, 'color').then(function(car) {
        assert.equal(1, car.related('color').id);
        assert.equal('Grey', car.related('color').get('name'));

        return manager.save(car, {
          color: {
            id: 1,
            name: 'Dark Grey'
          }
        });
      }).then(function(car) {
        return car.fetch({
          withRelated: 'color'
        });
      }).then(function(car) {
        assert.equal(1, car.related('color').id);
        assert.equal('Dark Grey', car.related('color').get('name'));
      });
    });

    it('should modify a deep nested model', function() {
      return manager.fetch('car', { id: 1 }, 'model.type').then(function(car) {
        assert.equal('Crossover', car.related('model').related('type').get('name'));

        return manager.save(car, {
          model: {
            id: car.related('model').id,
            type: {
              id: car.related('model').related('type').id,
              name: 'SUV'
            }
          }
        });
      }).then(function(car) {
        return car.fetch({
          withRelated: 'model.type'
        });
      }).then(function(car) {
        assert.equal('SUV', car.related('model').related('type').get('name'));
      });
    });

    it('should ignore _pivot_ keys', function() {
      return manager.fetch('car', { id: 1 }, 'features').then(function(car) {
        var feature = car.related('features').at(0);
        var json    = feature.toJSON();

        json.name = 'GPSv2';

        return manager.save(feature, json);
      }).then(function(feature) {
        assert.equal('GPSv2', feature.get('name'));
      });
    });

    it('should orphan models in collection', function() {
      return manager.fetch('car', { id: 1 }, 'features').then(function(car) {
        assert.equal(2, car.related('features').length, 'Car should have 2 existing features');

        return manager.save(car, {
          id: 1,
          features: []
        }).then(function(car) {
          assert.equal(0, car.related('features').length, 'Car should have all features removed, found: ' + car.related('features').toJSON());
        });
      });
    });

    it('should support original fetched response', function() {
      var expected;

      return manager
        .fetch('make', { name: 'BMW' }, [
          'models',
          'models.specs',
          'models.type',
          'dealers',
          'dealers.cars',
          'dealers.cars.color',
          'dealers.cars.model',
          'dealers.cars.features',
          'dealers.cars.model.type'
        ]).then(function(make) {
          expected = make.toJSON();

          return manager.save(make, expected);
        }).then(function(make) {
          var diffs = deep.diff(expected, make.toJSON()) || [];

          assert.equal(0, diffs.length, diffs);

          return manager.knex('models_specs').select();
        }).then(function(results) {
          assert.equal(2, results.length, 'Expected only 2 rows in `models_specs`, not ' + results.length);
        });
    });

    it('should support transactions', function() {
      return manager.bookshelf.transaction(function(t) {
        return manager.fetch('car', { id: 1 }, 'features', { transacting: t }).then(function(car) {
          return manager.save(car, {
            id: 1,
            quantity: 2,
            features: []
          }, {
            transacting: t
          }).then(function(car) {
            assert.equal(2, car.get('quantity', 'Car should have quantity 2, got: ' + car.get('quantity')));
            assert.equal(0, car.related('features').length, 'Car should have all features removed, found: ' + car.related('features').toJSON());
            throw new Error('test');
          });
        });
      }).catch(function(err) {
        if (!(err instanceof assert.AssertionError)) {
          return manager.fetch('car', { id: 1 }, 'features').then(function(car) {
            assert.equal(1, car.get('quantity', 'Car should have quantity 1, got: ' + car.get('quantity')));
            assert.equal(2, car.related('features').length, 'Car should have 2 existing features');
          });
        } else {
          throw err;
        }
      });
    });
  });
});
